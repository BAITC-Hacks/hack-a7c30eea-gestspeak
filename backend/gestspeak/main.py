import os
import hmac
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from . import store, engine
from .schema import TextInput, ActionPatch, SpeakerPatch, Segment
from .demo import make_demo
from .exports import export_docx, export_pdf

POOL = ThreadPoolExecutor(max_workers=1)
CAPACITY = threading.BoundedSemaphore(4)
LOCK = threading.RLock()
MAX_BYTES = 250 * 1024 * 1024
ORIGINS = ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:8000','http://127.0.0.1:8000']
for configured_origin in os.environ.get('GESTSPEAK_ALLOWED_ORIGINS', '').split(','):
    configured_origin = configured_origin.strip().rstrip('/')
    if not configured_origin:
        continue
    parsed_origin = urlsplit(configured_origin)
    if (parsed_origin.scheme not in ('http', 'https') or not parsed_origin.hostname
            or '*' in configured_origin or parsed_origin.username or parsed_origin.password
            or parsed_origin.path or parsed_origin.query or parsed_origin.fragment):
        raise ValueError('GESTSPEAK_ALLOWED_ORIGINS: укажите точные HTTP(S) origins через запятую')
    if configured_origin not in ORIGINS:
        ORIGINS.append(configured_origin)

@asynccontextmanager
async def lifespan(app):
    for m in store.all_meetings():
        if m['status'] in ('queued','processing'):
            m.update(status='error', error='Обработка прервана перезапуском. Загрузите запись повторно.')
            store.save(m,'interrupted')
    if not store.get('demo-samruk'): store.save(make_demo(),'demo_loaded')
    yield

app = FastAPI(title='GestSpeak Local API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['GET','POST','PATCH','DELETE'], allow_headers=['Content-Type','Authorization'])

@app.middleware('http')
async def guard(request: Request, call_next):
    origin = request.headers.get('origin')
    if request.method not in ('GET','HEAD','OPTIONS') and origin and origin not in ORIGINS:
        return Response('Origin forbidden',status_code=403)
    token = os.environ.get('GESTSPEAK_API_TOKEN','')
    if token and request.url.path.startswith('/api') and request.method != 'OPTIONS':
        if not hmac.compare_digest(request.headers.get('authorization',''), 'Bearer '+token):
            return Response('Authentication required', status_code=401)
    response = await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['Cache-Control']='no-store'
    return response

def meeting(mid):
    m=store.get(mid)
    if not m: raise HTTPException(404,'Совещание не найдено')
    return m

@app.get('/api/health')
def health(): return engine.health()

@app.get('/api/meetings')
def listing(): return store.all_meetings()

@app.get('/api/meetings/{mid}')
def detail(mid:str): return meeting(mid)

@app.post('/api/demo')
def demo():
    with LOCK: return store.save(make_demo(),'demo_reset')


def run(mid, segments=None, path=None, language='auto', speakers=None):
    def update(stage,progress):
        with LOCK:
            m=meeting(mid); m.update(stage=stage,progress=progress,status='processing'); store.save(m,stage)
    try:
        update('transcription' if path else 'analysis',10)
        duration=None
        if path: segments,duration=engine.transcribe(path,language,speakers,update)
        if not segments: raise RuntimeError('Речь не найдена. Проверьте запись.')
        update('analysis',75)
        m=meeting(mid)
        # Persist the transcript before extraction so model errors never lose recognized speech.
        m.update(segments=[s.model_dump() for s in segments])
        if duration is not None: m["duration"] = duration
        if not m["participants"]:
            m["participants"] = list(dict.fromkeys(s.speaker for s in segments if not s.speaker.startswith("SPEAKER_")))
        store.save(m,'transcribed')
        analysis,mode,warnings=engine.analyze(segments,date.fromisoformat(m['meeting_date']),m['participants'])
        with LOCK:
            m=meeting(mid)
            m.pop("error", None)
            m.update(**analysis.model_dump(mode='json'),engine=mode,warnings=warnings,status='ready',stage='ready',progress=100)
            store.save(m,'ready')
    except Exception as exc:
        with LOCK:
            m=store.get(mid)
            if m:
                m.update(status='error',error=str(exc)[:500],stage='error')
                store.save(m,'failed')
    finally: CAPACITY.release()


def new_meeting(title,meeting_date,participants,source):
    return {'id':uuid.uuid4().hex,'title':title,'meeting_date':str(meeting_date),
            'organization':'','created_at':datetime.now(timezone.utc).isoformat(),
            'participants':participants,'source':source,'status':'queued','stage':'queued','progress':0,
            'segments':[],'actions':[],'summary':[],'warnings':[],'duration':None,'audio':source=='audio','engine':'pending'}

@app.post('/api/meetings/text',status_code=202)
def text_input(body:TextInput):
    if not body.consent: raise HTTPException(400,'Подтвердите уведомление участников и право обработки записи')
    if not CAPACITY.acquire(False): raise HTTPException(429,'Очередь заполнена. Повторите позже.')
    m=new_meeting(body.title,body.meeting_date,body.participants,'text')
    try:
        store.save(m,'created'); POOL.submit(run,m['id'],engine.parse_transcript(body.transcript))
    except Exception:
        CAPACITY.release(); raise
    return m

@app.post('/api/meetings/audio',status_code=202)
async def audio_input(file:UploadFile=File(...), title:str=Form(...), meeting_date:date=Form(...), consent:bool=Form(False), language:str=Form('auto'), speakers:Optional[int]=Form(None), participants:str=Form('')):
    if not consent: raise HTTPException(400,'Подтвердите уведомление участников о записи')
    if not title.strip() or len(title)>200: raise HTTPException(422,'Название: от 1 до 200 символов')
    if language not in ('auto','ru','kk') or speakers is not None and not 1<=speakers<=30: raise HTTPException(422,'Некорректный язык или число говорящих')
    if len(participants)>5000: raise HTTPException(422,'Слишком длинный список участников')
    ext=Path(file.filename or '').suffix.lower()
    if ext not in ('.wav','.mp3','.mp4','.m4a','.webm','.ogg','.flac','.mov'): raise HTTPException(415,'Поддерживаются WAV, MP3, MP4, M4A, WEBM, OGG, FLAC, MOV')
    state=engine.health()
    if not state['asr'] or not state['diarization']: raise HTTPException(503,'Локальные модели Whisper и диаризации ещё не установлены. Откройте настройки и README. Можно проверить сценарий на тексте или демопримере.')
    if not CAPACITY.acquire(False): raise HTTPException(429,'Очередь заполнена')
    m=new_meeting(title,meeting_date,[n.strip() for n in participants.split(',') if n.strip()],'audio')
    path=store.DATA/'audio'/f"{m['id']}{ext}"
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    size=0
    try:
        with path.open('wb') as out:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>MAX_BYTES: raise HTTPException(413,'Максимальный размер записи — 250 МБ')
                out.write(chunk)
        if size==0: raise HTTPException(400,'Файл пустой')
        m['audio_name']=path.name
        store.save(m,'uploaded'); POOL.submit(run,m['id'],None,path,language,speakers)
    except Exception:
        path.unlink(missing_ok=True); CAPACITY.release(); raise
    finally: await file.close()
    return m

@app.patch('/api/meetings/{mid}/actions/{aid}')
def patch_action(mid:str,aid:str,body:ActionPatch):
    with LOCK:
        m=meeting(mid)
        a=next((a for a in m['actions'] if a['id']==aid),None)
        if not a: raise HTTPException(404,'Поручение не найдено')
        changes=body.model_dump(mode='json',exclude_unset=True)
        if any(k in changes and changes[k] is None for k in ('title', 'status', 'needs_review')): raise HTTPException(422,'Пустое значение недопустимо')
        a.update(changes)
        if any(k in changes for k in ('title','owner','due_date')): a['needs_review']=True
        if changes.get('needs_review') is False:
            if not a.get('owner') or not a.get('due_date'): raise HTTPException(422,'Перед проверкой укажите ответственного и срок')
            a['needs_review']=False; a['review_reason']='Проверено секретарём'
        if 'due_date' in changes: a['due_start']=None
        return store.save(m,'action_updated')

@app.patch('/api/meetings/{mid}/speakers')
def rename_speaker(mid:str,body:SpeakerPatch):
    with LOCK:
        m=meeting(mid)
        if body.speaker not in [s['speaker'] for s in m['segments']]: raise HTTPException(404,'Говорящий не найден')
        for s in m['segments']:
            if s['speaker']==body.speaker: s['speaker']=body.name
        for a in m['actions']:
            if a['owner']==body.speaker: a.update(owner=body.name,needs_review=True)
        m['participants']=list(dict.fromkeys([s['speaker'] for s in m['segments']]))
        return store.save(m,'speaker_identified')

@app.post('/api/meetings/{mid}/reanalyze',status_code=202)
def reanalyze(mid:str):
    with LOCK:
        m=meeting(mid)
        if m['status'] in ('queued','processing'): raise HTTPException(409,'Обработка уже выполняется')
        if not m['segments']: raise HTTPException(400,'Нет транскрипта')
        if not CAPACITY.acquire(False): raise HTTPException(429,'Очередь заполнена')
        # Keep old annotations until successful extraction; this action is explicit in UI.
        m.pop('error', None)
        m.update(status='queued',stage='queued',progress=0)
        try:
            segments = [Segment.model_validate(s) for s in m['segments']]
            store.save(m,'reanalyze')
            POOL.submit(run,mid,segments)
        except Exception:
            CAPACITY.release()
            raise
        return m

@app.get('/api/meetings/{mid}/export/{fmt}')
def export(mid:str,fmt:str):
    m=meeting(mid)
    if m['status']!='ready': raise HTTPException(409,'Дождитесь завершения обработки')
    if fmt=='pdf': data=export_pdf(m); mime='application/pdf'
    elif fmt=='docx': data=export_docx(m); mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    elif fmt=='json': return m
    else: raise HTTPException(404,'Неизвестный формат')
    return Response(data,media_type=mime,headers={'Content-Disposition':f'attachment; filename="protocol-{mid}.{fmt}"'})

@app.get('/api/meetings/{mid}/audio')
def get_audio(mid:str):
    m=meeting(mid)
    if not m.get('audio_name'): raise HTTPException(404,'Аудиозапись отсутствует')
    return FileResponse(store.DATA/'audio'/m['audio_name'])

@app.get('/api/meetings/{mid}/audit')
def audit(mid:str): meeting(mid); return store.audit(mid)

@app.delete('/api/meetings/{mid}',status_code=204)
def remove(mid:str):
    with LOCK:
        m=meeting(mid)
        if m['status'] in ('queued','processing'): raise HTTPException(409,'Дождитесь окончания обработки')
        if m.get('audio_name'): (store.DATA/'audio'/m['audio_name']).unlink(missing_ok=True)
        store.delete(mid)
    return Response(status_code=204)

@app.get('/api/reminders')
def reminders():
    from zoneinfo import ZoneInfo
    today=datetime.now(ZoneInfo('Asia/Almaty')).date()
    result=[]
    for m in store.all_meetings():
        for a in m['actions']:
            if a['status']=='done' or not a.get('due_date'): continue
            days=(date.fromisoformat(a['due_date'])-today).days
            if days<=3: result.append({**a,'meeting_id':m['id'],'meeting_title':m['title'],'days_left':days,'draft':a['needs_review']})
    return sorted(result,key=lambda a:a['due_date'])

# Production: serve the exported frontend from the same origin as the API.
# This mount is deliberately last, so it never shadows API routes.
from fastapi.staticfiles import StaticFiles
STATIC = Path(__file__).resolve().parents[2] / 'frontend' / 'out'
if not STATIC.exists():
    STATIC = Path(__file__).resolve().parents[2] / 'frontend' / 'dist' / 'client'
if (STATIC / 'index.html').exists():
    app.mount('/', StaticFiles(directory=str(STATIC), html=True), name='web')
