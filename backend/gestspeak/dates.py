"""Deterministic RU/KK dates. Never silently guess an unsupported deadline."""
import re
from datetime import date, timedelta

MONTHS = {
    "январ": 1, "қаңтар": 1, "феврал": 2, "ақпан": 2, "март": 3, "наурыз": 3,
    "апрел": 4, "сәуір": 4, "мая": 5, "мамыр": 5, "июн": 6, "маусым": 6,
    "июл": 7, "шілде": 7, "август": 8, "тамыз": 8, "сентябр": 9, "қыркүйек": 9,
    "октябр": 10, "қазан": 10, "ноябр": 11, "қараша": 11, "декабр": 12, "желтоқсан": 12,
}
WEEKDAYS = {"понедельник": 0, "дүйсенбі": 0, "вторник": 1, "сейсенбі": 1,
            "сред": 2, "сәрсенбі": 2, "четверг": 3, "бейсенбі": 3,
            "пятниц": 4, "жұма": 4, "суббот": 5, "сенбі": 5, "воскресень": 6, "жексенбі": 6}


# Calendar days in ordinary Russian speech, including inflected ordinals.
ORDINAL_STEMS = {
    "перв": 1, "втор": 2, "треть": 3, "четвёрт": 4, "четверт": 4,
    "пят": 5, "шест": 6, "седьм": 7, "восьм": 8, "девят": 9, "десят": 10,
    "одиннадцат": 11, "двенадцат": 12, "тринадцат": 13, "четырнадцат": 14,
    "пятнадцат": 15, "шестнадцат": 16, "семнадцат": 17, "восемнадцат": 18,
    "девятнадцат": 19, "двадцат": 20, "тридцат": 30,
}


def normalize_day_words(text):
    pattern = r"\b(" + "|".join(sorted(ORDINAL_STEMS, key=len, reverse=True)) + r")(?:ого|ому|ое|ый|ой|его|ему|е)\b"
    text = re.sub(pattern, lambda m: str(ORDINAL_STEMS[m[1]]), text)
    text = re.sub(r"\b(двадцать|тридцать)\s+([1-9])\b", lambda m: str((20 if m[1] == 'двадцать' else 30) + int(m[2])), text)
    return text


def resolve_deadline(raw: str, base: date):
    s = normalize_day_words((raw or "").lower().strip())
    if not s:
        return None, None, "Срок не указан"
    iso = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", s)
    if iso:
        try:
            return date.fromisoformat(iso[1]), None, ""
        except ValueError:
            return None, None, "Некорректная дата"
    for month, number in MONTHS.items():
        if month in s:
            day = re.search(r"\b([0-3]?\d)\b", s)
            year = re.search(r"\b(20\d{2})\b", s)
            if day:
                try:
                    d = date(int(year[1]) if year else base.year, number, int(day[1]))
                    return d, None, "Год взят из даты совещания" if not year else ""
                except ValueError:
                    return None, None, "Некорректная дата"
    numeric = re.search(r"\b(\d{1,2})\.(\d{1,2})(?:\.(20\d{2}))?\b", s)
    if numeric:
        try:
            return date(int(numeric[3] or base.year), int(numeric[2]), int(numeric[1])), None, "" if numeric[3] else "Год взят из даты совещания"
        except ValueError:
            return None, None, "Некорректная дата"
    if "послезавтра" in s or "бүрсігүні" in s:
        return base + timedelta(days=2), None, ""
    if "завтра" in s or "ертең" in s:
        return base + timedelta(days=1), None, ""
    if "сегодня" in s or "бүгін" in s:
        return base, None, ""
    next_week = "следующ" in s or "келесі" in s
    for word, weekday in sorted(WEEKDAYS.items(), key=lambda pair: -len(pair[0])):
        if word in s:
            delta = (weekday - base.weekday()) % 7
            if next_week:
                delta = 7 - base.weekday() + weekday
            return base + timedelta(days=delta), None, "День недели трактуется как ближайший, включая день совещания; подтвердите"
    if "недел" in s or "апта" in s:
        duration = re.search(r"(\d+|одну|одна|две|два|три|бір|екі|үш)\s+(?:недел|апта)", s)
        if duration:
            numbers = {"одну": 1, "одна": 1, "две": 2, "два": 2, "три": 3, "бір": 1, "екі": 2, "үш": 3}
            count = int(duration[1]) if duration[1].isdigit() else numbers[duration[1]]
            if count > 52:
                return None, None, "Слишком большой относительный срок; уточните дату"
            return base + timedelta(weeks=count), None, "Отсчитаны календарные недели от даты совещания; подтвердите"
        if not next_week and not any(w in s for w in ("этой", "текущ", "осы", "конца недели")):
            return None, None, "Уточните, какая неделя имеется в виду"
        monday = base - timedelta(days=base.weekday()) + timedelta(days=7 if next_week else 0)
        return monday + timedelta(days=4), max(base, monday), "Неделя трактуется как рабочая: пн–пт; подтвердите"
    return None, None, "Срок требует уточнения"
