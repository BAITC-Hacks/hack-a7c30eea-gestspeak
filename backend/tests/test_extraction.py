"""Regression tests use new names/tasks, not the annotated demonstration rows."""
from datetime import date
from pathlib import Path

from gestspeak.engine import parse_transcript, rule_extract, validate_analysis, spoken_deadline
from gestspeak.dates import resolve_deadline


def analyze_text(text):
    segments = parse_transcript(text)
    return validate_analysis(rule_extract(segments), segments, date(2026, 9, 23), [])


def test_document_speaker_headings_and_roles():
    segments = parse_transcript('''Марина Игоревна (руководитель)
Павел Андреевич, подготовьте отчёт до 30 сентября.
Павел Андреевич
Хорошо, сделаю.
''')
    assert [s.speaker for s in segments] == ['Марина Игоревна', 'Павел Андреевич']
    actions = analyze_text('''Марина Игоревна (руководитель)
Павел Андреевич, подготовьте отчёт до 30 сентября.
Павел Андреевич
Хорошо, сделаю.
''').actions
    assert len(actions) == 1
    assert actions[0].owner == 'Павел Андреевич'
    assert actions[0].due_date == date(2026, 9, 30)


def test_contextual_assignment_and_agreed_deadline_override():
    result = analyze_text('''Руководитель: Ольга Петровна, вы отвечаете за закупки?
Ольга Петровна: Да, за закупки отвечаю.
Руководитель: Мне нужен аудит оборудования. Две недели вам достаточно?
Ольга Петровна: Нужны три недели.
Руководитель: Хорошо, к двадцать второму октября жду результаты.
Ольга Петровна: Принято.
''')
    assert len(result.actions) == 1
    action = result.actions[0]
    assert action.owner == 'Ольга Петровна'
    assert action.due_date == date(2026, 10, 22)
    assert {'s1', 's3', 's5', 's6'} <= set(action.evidence)
    assert action.needs_review


def test_deadline_in_assignees_reply():
    result = analyze_text('''Ирина: Данияр, проверьте договор поставки.
Данияр: Хорошо, к четвергу будет ответ.
Ирина: Итого — Данияр по договору к четвергу.
''')
    assert len(result.actions) == 1
    assert result.actions[0].owner == 'Данияр'
    assert result.actions[0].deadline_text == 'к четвергу'
    assert result.actions[0].due_date == date(2026, 9, 24)
    assert result.actions[0].evidence == ['s1', 's2']


def test_kazakh_contextual_directive_and_mixed_deadline():
    result = analyze_text('''Айгүл: Данияр, есеп дайындаңыз, келесі аптада.
Данияр: Жақсы, дайындаймын.
Айгүл: Айнұр, келісімшартты тексеріңіз, до 30 сентября.
Айнұр: Түсінікті.
''')
    assert len(result.actions) == 2
    assert [(a.owner, a.due_date) for a in result.actions] == [
        ('Данияр', date(2026, 10, 2)), ('Айнұр', date(2026, 9, 30))]


def test_department_assignment_does_not_require_person_marker():
    result = analyze_text('Руководитель: Провести ревизию — Финансовый департамент, срок до 30 сентября.')
    assert len(result.actions) == 1
    assert result.actions[0].owner == 'Финансовый департамент'


def test_proposal_and_question_are_not_orders():
    result = analyze_text('''Анна: Борис, может, проведите проверку на следующей неделе?
Борис: Предлагаю подготовить план до пятницы.
Анна: Борис, когда последний раз был аудит?
''')
    assert result.actions == []


def test_no_name_fabricated_without_context():
    result = analyze_text('SPEAKER_00: Подготовьте отчёт до пятницы.')
    assert len(result.actions) == 1
    assert result.actions[0].owner is None
    assert result.actions[0].needs_review


def test_rules_extract_original_case_without_demo_annotations():
    text = (Path(__file__).resolve().parents[2] / 'examples' / 'samruk.txt').read_text()
    result = analyze_text(text)
    assert len(result.actions) == 10
    assert all(a.quote and a.evidence and a.needs_review for a in result.actions)
    audit = next(a for a in result.actions if 'полный аудит' in a.title)
    assert audit.owner == 'Нурлан Сагатович'
    assert audit.due_date == date(2026, 10, 15)
    assert any('Выдержки' in s for s in result.summary)


def test_calendar_words_weekday_priority_and_day_after_tomorrow():
    base = date(2026, 9, 23)
    for raw, expected in [('к двадцать пятому сентября', date(2026, 9, 25)),
                          ('к первому октября', date(2026, 10, 1)),
                          ('послезавтра', date(2026, 9, 25)),
                          ('в среду на следующей неделе', date(2026, 9, 30)),
                          ('до конца недели', date(2026, 9, 25))]:
        assert resolve_deadline(raw, base)[0] == expected
    assert spoken_deadline('Проверьте основания для претензии к подрядчику') == ''


def test_year_is_preserved_and_spoken_name_can_follow_anonymous_cluster():
    result = analyze_text("SPEAKER_00: Ольга Петровна, подготовьте отчёт к 20 октября 2027.")
    assert len(result.actions) == 1
    assert result.actions[0].owner == 'Ольга Петровна'
    assert result.actions[0].deadline_text == 'к 20 октября 2027'
    assert result.actions[0].due_date == date(2027, 10, 20)
