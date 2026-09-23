from fastapi.testclient import TestClient
from gestspeak import main, store
from gestspeak.demo import make_demo
from gestspeak.schema import Analysis


def test_edit_validation_keeps_existing_data():
    with TestClient(main.app) as client:
        client.post('/api/demo')
        for patch in ({'needs_review': None}, {'title': '   '}, {'status': None}):
            response = client.patch('/api/meetings/demo-samruk/actions/a1', json=patch)
            assert response.status_code == 422
        action = client.get('/api/meetings/demo-samruk').json()['actions'][0]
        assert action['needs_review'] is True
        assert action['title'].strip()
        invalid = client.post('/api/meetings/text', json={
            'title': '   ', 'meeting_date': '2026-09-23', 'consent': True,
            'transcript': 'Нурлан: Подготовить отчёт до пятницы.'})
        assert invalid.status_code == 422


def test_reanalysis_preserves_audio_metadata_and_clears_old_error(monkeypatch):
    class ImmediateExecutor:
        def submit(self, function, *args):
            function(*args)

    monkeypatch.setattr(main, 'POOL', ImmediateExecutor())
    monkeypatch.setattr(main.engine, 'analyze', lambda *args: (Analysis(summary=['Проверено']), 'rules', []))
    with TestClient(main.app) as client:
        meeting = make_demo()
        meeting.update(id='reanalysis-regression', source='audio', audio=True, duration=42.5,
                       status='error', error='Старая ошибка')
        store.save(meeting)
        assert client.post('/api/meetings/reanalysis-regression/reanalyze').status_code == 202
        updated = client.get('/api/meetings/reanalysis-regression').json()
        assert updated['status'] == 'ready'
        assert updated['duration'] == 42.5
        assert updated['source'] == 'audio'
        assert 'error' not in updated
