"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sampleTranscripts } from "@/lib/sample-transcripts";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock3,
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  Globe2,
  Loader2,
  LockKeyhole,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Action = {
  id: string;
  title: string;
  owner: string | null;
  deadline_text: string;
  due_date: string | null;
  due_start: string | null;
  topic: string;
  priority: string;
  status: "open" | "in_progress" | "done";
  evidence: string[];
  quote: string;
  needs_review: boolean;
  review_reason: string;
};
type Segment = {
  id: string;
  speaker: string;
  text: string;
  start: number | null;
  end: number | null;
};
type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  organization: string;
  source: string;
  engine: string;
  status: string;
  stage: string;
  progress: number;
  participants: string[];
  segments: Segment[];
  actions: Action[];
  summary: string[];
  warnings: string[];
  audio: boolean;
  duration: number | null;
  error?: string;
};
type Health = {
  llm: boolean;
  llm_model: string;
  asr: boolean;
  diarization: boolean;
  privacy: string;
};
type Task = Action & { meeting_id: string; meeting_title: string };
const statuses = {
  open: "К выполнению",
  in_progress: "В работе",
  done: "Выполнено",
};
const stages: Record<string, string> = {
  queued: "В очереди",
  diarization: "Различаем голоса",
  transcription: "Распознаём речь",
  analysis: "Выделяем решения и поручения",
  ready: "Готово",
  error: "Требуется внимание",
};
const auditLabels: Record<string, string> = {
  created: "Совещание создано", uploaded: "Запись загружена",
  demo_loaded: "Демопример добавлен", demo_reset: "Демопример восстановлен",
  transcribed: "Речь распознана", ready: "Протокол сформирован",
  action_updated: "Поручение обновлено", speaker_identified: "Имя участника уточнено",
  reanalyze: "Повторный анализ", failed: "Ошибка обработки", interrupted: "Обработка прервана",
};
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function fmt(d: string | null) {
  return d
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
      }).format(new Date(d + "T12:00:00"))
    : "Без срока";
}
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
}
function time(s: number) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
function overdue(a: Action) {
  return a.status !== "done" && !!a.due_date && a.due_date < today();
}

export default function Page() {
  const [view, setView] = useState("home");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [create, setCreate] = useState(false);
  const [createMode, setCreateMode] = useState("file");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [settings, setSettings] = useState(false);
  const [token, setToken] = useState("");
  const tokenRef = useRef("");
  const [tab, setTab] = useState("summary");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [speaker, setSpeaker] = useState<{ old: string; name: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<{ event: string; at: string }[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (tokenRef.current)
      headers.set("Authorization", "Bearer " + tokenRef.current);
    if (init.body && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    const response = await fetch("/api" + path, { ...init, headers });
    if (!response.ok) {
      let message = "Сервер недоступен";
      try {
        const data = await response.json();
        message = response.status === 401
          ? "Введите токен доступа в настройках."
          : typeof data.detail === "string"
            ? data.detail
            : "Проверьте заполнение полей: название, дата, участники и согласие на обработку.";
      } catch {
        message =
          response.status === 401
            ? "Введите токен доступа в настройках."
            : `Ошибка ${response.status}. Проверьте подключение к локальному серверу.`;
      }
      throw new Error(message);
    }
    return response;
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await api("/meetings");
      setMeetings(await r.json());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);
  const checkHealth = useCallback(async () => {
    try {
      setHealth(await (await api("/health")).json());
    } catch {
      setHealth(null);
    }
  }, [api]);
  useEffect(() => {
    refresh();
    checkHealth();
    const timer = setInterval(refresh, 4000);
    const healthTimer = setInterval(checkHealth, 30000);
    return () => { clearInterval(timer); clearInterval(healthTimer); };
  }, [refresh, checkHealth]);
  useEffect(() => {
    if (create || settings) checkHealth();
  }, [create, settings, checkHealth]);
  useEffect(() => {
    const restore = () => {
      const route = window.location.hash.slice(1);
      if (route.startsWith("meeting/")) {
        setSelected(route.slice(8));
        setView("detail");
      } else if (["home", "meetings", "tasks", "reminders"].includes(route)) {
        setSelected(null);
        setView(route);
      }
      setQuery("");
      setFilter("all");
      setOwnerFilter("all");
      setAudit([]);
    };
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const meeting = meetings.find((m) => m.id === selected);
  const tasks = useMemo(
    () =>
      meetings.flatMap((m) =>
        m.actions.map((a) => ({
          ...a,
          meeting_id: m.id,
          meeting_title: m.title,
        })),
      ),
    [meetings],
  );
  const visibleTasks = tasks.filter(
    (a) =>
      (!selected || view !== "detail" || a.meeting_id === selected) &&
      (filter === "all" ||
        (filter === "review" && a.needs_review) ||
        (filter === "overdue" && overdue(a)) ||
        a.status === filter) &&
      (ownerFilter === "all" || a.owner === ownerFilter) &&
      `${a.title} ${a.owner || ""} ${a.meeting_title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const reminders = tasks
    .filter(
      (a) =>
        a.status !== "done" &&
        a.due_date &&
        a.due_date <=
          new Date(new Date(today() + "T12:00:00Z").getTime() + 3 * 86400000)
            .toISOString()
            .slice(0, 10),
    )
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  function navigate(next: string) {
    window.history.pushState(null, "", "#" + next);
    setView(next);
    setSelected(null);
    setQuery("");
    setFilter("all");
    setOwnerFilter("all");
  }
  function openMeeting(id: string) {
    window.history.pushState(null, "", "#meeting/" + id);
    setAudit([]);
    setSelected(id);
    setView("detail");
    setTab("summary");
    setQuery("");
    setFilter("all");
    setOwnerFilter("all");
  }
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateAction(mid: string, id: string, data: Partial<Action>) {
    await api(`/meetings/${mid}/actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    await refresh();
  }
  async function download(fmt: "pdf" | "docx") {
    if (!meeting) return;
    await perform(async () => {
      const r = await api(`/meetings/${meeting.id}/export/${fmt}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Протокол-${meeting.meeting_date}.${fmt}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Протокол скачан");
    });
  }
  useEffect(() => {
    if (!meeting?.audio) return;
    let url = "";
    let active = true;
    api(`/meetings/${meeting.id}/audio`)
      .then((r) => r.blob())
      .then((b) => {
        if (!active) return;
        url = URL.createObjectURL(b);
        setAudioUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      setAudioUrl("");
    };
  }, [meeting?.id, meeting?.audio, api]);
  // Progressive enhancement: the same navigation as the visible meeting list.
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "open_meeting",
          description:
            "Открыть существующее совещание в интерфейсе. Не изменяет записи.",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            const id = (input as { id?: string })?.id;
            if (typeof id !== "string" || !meetings.some((m) => m.id === id))
              throw new Error("Совещание не найдено");
            openMeeting(id);
            return { id, opened: true };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [meetings]);
  const nav = [
    ["home", "Обзор"],
    ["meetings", "Совещания"],
    ["tasks", "Поручения"],
  ];
  function taskTable(items: Task[]) {
    return (
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Поручение</TableHead>
              <TableHead>Ответственный</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>
                <span className="sr-only">Открыть</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.meeting_id + a.id}>
                <TableCell>
                  <button className="task-title" onClick={() => setEditing(a)}>
                    {a.title}
                  </button>
                  <div className="task-meta">
                    {a.needs_review && <span className="dot amber" />}
                    {a.needs_review ? "Нужна проверка" : a.topic}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="owner">
                    <span className="avatar">{initials(a.owner || "?")}</span>
                    <span>{a.owner || "Не определён"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={overdue(a) ? "late" : ""}>
                    {fmt(a.due_date)}
                  </span>
                  {a.due_start && <small>с {fmt(a.due_start)}</small>}
                </TableCell>
                <TableCell>
                  <NativeSelect
                    aria-label={"Статус: " + a.title}
                    disabled={busy}
                    value={a.status}
                    onChange={(e) =>
                      perform(() =>
                        updateAction(a.meeting_id, a.id, {
                          status: e.target.value as Action["status"],
                        }),
                      )
                    }
                  >
                    {Object.entries(statuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <button
                    className="icon-button"
                    aria-label={"Редактировать: " + a.title}
                    onClick={() => setEditing(a)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items.length === 0 && (
          <div className="empty">
            <ClipboardList />
            <h3>Поручений пока нет</h3>
            <p>Измените фильтр или добавьте совещание.</p>
          </div>
        )}
      </div>
    );
  }
  function toolbar() {
    return (
      <div className="toolbar">
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти поручение"
            aria-label="Поиск поручений"
          />
        </label>
        <NativeSelect
          aria-label="Фильтр статуса"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Все статусы</option>
          <option value="review">Нужна проверка</option>
          <option value="open">К выполнению</option>
          <option value="in_progress">В работе</option>
          <option value="done">Выполнено</option>
          <option value="overdue">Просрочено</option>
        </NativeSelect>
        <NativeSelect
          aria-label="Ответственный"
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
        >
          <option value="all">Все ответственные</option>
          {Array.from(new Set(tasks.map((t) => t.owner).filter(Boolean))).map(
            (o) => (
              <option key={o!} value={o!}>
                {o}
              </option>
            ),
          )}
        </NativeSelect>
      </div>
    );
  }
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-mark">
            <AudioLines size={22} />
          </span>
          gestspeak<span className="brand-beta">beta</span>
        </a>
        <nav aria-label="Основная навигация">
          {nav.map(([id, label]) => (
            <button
              key={id}
              className={view === id || (id === "meetings" && view === "detail") ? "active" : ""}
              aria-current={view === id || (id === "meetings" && view === "detail") ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <span className="local">
            <span className="dot green" />
            Локальный контур
          </span>
          <button
            className={"icon-button " + (view === "reminders" ? "active" : "")}
            aria-label="Напоминания"
            onClick={() => navigate("reminders")}
          >
            <Bell size={19} />
            {reminders.length > 0 && <i className="notification-dot" />}
          </button>
          <button
            className="profile"
            onClick={() => setSettings(true)}
            aria-label="Настройки"
          >
            СК
          </button>
        </div>
      </header>
      <main id="main">
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button
              onClick={() => {
                refresh();
                checkHealth();
              }}
            >
              Повторить
            </button>
            <button onClick={() => setSettings(true)}>Настройки</button>
          </div>
        )}
        {view === "home" && (
          <>
            <div className="welcome-row">
              <div className="eyebrow">
                <span className="dot" /> РАБОЧЕЕ ПРОСТРАНСТВО
              </div>
              <span className="date-caption" suppressHydrationWarning>
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date())}
              </span>
            </div>
            <section className="hero">
              <div className="hero-copy">
                <h1>
                  Обсудили.
                  <br />
                  <span className="highlight">Зафиксировали.</span>
                </h1>
                <p className="intro">
                  Превратите разговор в понятный план.
                  <br />
                  Поручения, люди и сроки — на своих местах.
                </p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => setCreate(true)}>
                    <Plus size={18} />
                    Новое совещание
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      const demo = meetings.find((m) => m.source === "demo");
                      if (demo) openMeeting(demo.id);
                      else
                        perform(async () => {
                          const m = await (
                            await api("/demo", { method: "POST" })
                          ).json();
                          await refresh();
                          openMeeting(m.id);
                        });
                    }}
                  >
                    Открыть демопример <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="hero-facts">
                  <span>
                    <Globe2 size={15} /> Русский · Қазақша · Смешанный
                  </span>
                  <span>
                    <LockKeyhole size={14} /> Данные внутри компании
                  </span>
                </div>
              </div>
              <div className="capture-card">
                <div className="capture-top">
                  <span>
                    <AudioLines size={18} /> Ваше следующее совещание
                  </span>
                  <button className="small-tag" onClick={() => setSettings(true)} title="Состояние локальных моделей">
                    {health?.asr && health?.diarization ? "Аудио готово" : "Настроить аудио"}
                  </button>
                </div>
                <div
                  className="upload-target"
                  role="button"
                  tabIndex={0}
                  onClick={() => setCreate(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCreateMode("file"); setCreate(true); }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setPendingFile(e.dataTransfer.files[0] || null);
                    setCreate(true);
                  }}
                >
                  <span className="upload-icon">
                    <Upload size={25} />
                  </span>
                  <h3>Добавьте запись встречи</h3>
                  <p>Аудио, видео или готовый текст</p>
                  <span className="file-types">
                    MP3, WAV, M4A, MP4 · до 250 МБ
                  </span>
                  <button
                    className="ghost-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreate(true);
                    }}
                  >
                    Выбрать файл <ArrowRight size={16} />
                  </button>
                </div>
                <div className="capture-bottom">
                  <span>
                    <ShieldCheck size={15} /> Обработка на вашем сервере
                  </span>
                  <button
                    className="text-button compact"
                    onClick={() => {
                      setCreateMode("record");
                      setCreate(true);
                    }}
                  >
                    <Mic size={15} />
                    Записать
                  </button>
                </div>
              </div>
            </section>
            <section className="metrics" aria-label="Статистика">
              <button onClick={() => navigate("meetings")}>
                <span className="metric-icon sky">
                  <FileText size={20} />
                </span>
                <div>
                  <strong>{meetings.length.toString().padStart(2, "0")}</strong>
                  <span>Совещаний</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
              <button onClick={() => navigate("tasks")}>
                <span className="metric-icon peach">
                  <ClipboardList size={20} />
                </span>
                <div>
                  <strong>
                    {tasks
                      .filter((a) => a.status !== "done")
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                  <span>Открытых поручений</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
              <button
                onClick={() => {
                  navigate("tasks");
                  setFilter("review");
                }}
              >
                <span className="metric-icon yellow">
                  <Clock3 size={20} />
                </span>
                <div>
                  <strong>
                    {tasks
                      .filter((a) => a.needs_review)
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                  <span>Ожидают проверки</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
              <button
                onClick={() => {
                  navigate("tasks");
                  setFilter("done");
                }}
              >
                <span className="metric-icon mint">
                  <CheckCheck size={20} />
                </span>
                <div>
                  <strong>
                    {tasks
                      .filter((a) => a.status === "done")
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                  <span>Выполнено</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
            </section>
            <section>
              <div className="section-title">
                <h2>Последние совещания</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("meetings")}
                >
                  Все совещания <ArrowRight size={16} />
                </button>
              </div>
              <div className="meetings-grid">
                {meetings.slice(0, 3).map((m, i) => (
                  <button
                    className={"meeting-card card-" + i}
                    key={m.id}
                    onClick={() => openMeeting(m.id)}
                  >
                    <div className="card-top">
                      <span className="document-icon">
                        <FileText size={22} />
                      </span>
                      <span className="badge">
                        {m.source === "demo"
                          ? "Демопример"
                          : m.status === "ready"
                            ? "Протокол готов"
                            : stages[m.stage] || m.stage}
                      </span>
                    </div>
                    <h3>{m.title}</h3>
                    <p>
                      {fmt(m.meeting_date)} ·{" "}
                      {new Set(m.segments.map((s) => s.speaker)).size}{" "}
                      участников
                    </p>
                    <div className="card-bottom">
                      <div className="avatar-stack">
                        {Array.from(new Set(m.segments.map((s) => s.speaker)))
                          .slice(0, 4)
                          .map((s, j) => (
                            <span key={s} className={"avatar tone-" + j}>
                              {initials(s)}
                            </span>
                          ))}
                      </div>
                      <span>
                        {m.actions.length} поручений <ArrowUpRight size={17} />
                      </span>
                    </div>
                  </button>
                ))}
                <button className="new-card" onClick={() => setCreate(true)}>
                  <span className="plus-circle">
                    <Plus size={24} />
                  </span>
                  <h3>Начните новое совещание</h3>
                  <p>
                    Загрузите запись.
                    <br />
                    Сохраните каждое решение.
                  </p>
                </button>
              </div>
              {loading && (
                <div className="loading">
                  <Loader2 className="spin" />
                  Загружаем рабочее пространство…
                </div>
              )}
            </section>
          </>
        )}
        {view === "meetings" && (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</div>
                <h1>Совещания</h1>
                <p>Записи, транскрипты и итоговые протоколы команды.</p>
              </div>
              <button className="primary" onClick={() => setCreate(true)}>
                <Plus size={18} />
                Новое совещание
              </button>
            </div>
            <label className="search full">
              <Search size={18} />
              <input
                placeholder="Поиск по названию"
                aria-label="Поиск совещаний"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="meeting-list">
              {meetings
                .filter((m) =>
                  m.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((m) => (
                  <div className="meeting-list-row" key={m.id}>
                    <span className="document-icon">
                      <FileText />
                    </span>
                    <button onClick={() => openMeeting(m.id)}>
                      <h3>{m.title}</h3>
                      <p>
                        {fmt(m.meeting_date)} · {m.actions.length} поручений ·{" "}
                        {m.source === "demo"
                          ? "Размеченный пример"
                          : m.source === "audio"
                            ? "Аудиозапись"
                            : "Текст"}
                      </p>
                    </button>
                    <span className="badge">{stages[m.stage] || m.stage}</span>
                    <button
                      className="icon-button"
                      aria-label={"Удалить " + m.title}
                      onClick={() => setRemoving(m.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
            </div>
            {!loading && meetings.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())).length === 0 && (
              <div className="empty">
                <FolderOpen />
                <h3>{query ? "Совещаний с таким названием нет" : "Здесь будут ваши совещания"}</h3>
                <button
                  className="ghost-button"
                  onClick={() => setCreate(true)}
                >
                  Добавить первое
                </button>
              </div>
            )}
          </>
        )}
        {view === "tasks" && (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">КОНТРОЛЬ ИСПОЛНЕНИЯ</div>
                <h1>Поручения</h1>
                <p>
                  {tasks.length} поручений · {tasks.filter(overdue).length}{" "}
                  просрочено · {tasks.filter((a) => a.needs_review).length} на
                  проверке
                </p>
              </div>
              <span className="heading-icon yellow">
                <ClipboardList size={36} />
              </span>
            </div>
            {toolbar()}
            {taskTable(visibleTasks)}
          </>
        )}
        {view === "reminders" && (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">КОНТРОЛЬ СРОКОВ</div>
                <h1>Напоминания</h1>
                <p>
                  Просроченные поручения и сроки в ближайшие три дня. Часовой
                  пояс: Алматы.
                </p>
              </div>
              <span className="heading-icon peach">
                <Bell size={36} />
              </span>
            </div>
            <div className="callout">
              <Bell size={19} />
              <p>
                Напоминания обновляются в приложении. Черновики помечены
                отдельно; внешняя рассылка не включена.
              </p>
            </div>
            {reminders.map((a) => (
              <button
                className="reminder-card"
                key={a.meeting_id + a.id}
                onClick={() => setEditing(a)}
              >
                <span
                  className={"metric-icon " + (overdue(a) ? "peach" : "yellow")}
                >
                  <Clock3 size={22} />
                </span>
                <div>
                  <span className={"mini-label " + (overdue(a) ? "late" : "")}>
                    {overdue(a) ? "ПРОСРОЧЕНО" : "СКОРО СРОК"} ·{" "}
                    {fmt(a.due_date)}
                    {a.needs_review ? " · ЧЕРНОВИК" : ""}
                  </span>
                  <h3>{a.title}</h3>
                  <p>
                    {a.owner || "Ответственный не определён"} ·{" "}
                    {a.meeting_title}
                  </p>
                </div>
                <ArrowUpRight size={20} />
              </button>
            ))}
            {reminders.length === 0 && (
              <div className="empty">
                <CircleCheck />
                <h3>Всё под контролем</h3>
                <p>Ближайших и просроченных поручений нет.</p>
              </div>
            )}
          </>
        )}
        {view === "detail" && meeting && (
          <>
            <button className="back" onClick={() => navigate("meetings")}>
              <ArrowLeft size={16} /> Все совещания
            </button>
            <div className="document-heading">
              <div className="document-label">
                <FileText size={18} />
                <span>ПРОТОКОЛ СОВЕЩАНИЯ</span>
                <span className="badge">
                  {meeting.source === "demo"
                    ? "Демопример"
                    : meeting.engine === "rules"
                      ? "Анализ по правилам"
                      : "Локальная обработка"}
                </span>
              </div>
              <h1>{meeting.title}</h1>
              <div className="meeting-info">
                <span>
                  <Clock3 size={16} />
                  {fmt(meeting.meeting_date)} {meeting.meeting_date.slice(0, 4)}
                </span>
                <span>
                  <Users size={16} />
                  {new Set(meeting.segments.map((s) => s.speaker)).size}{" "}
                  участников
                </span>
                <span>
                  <Globe2 size={16} /> RU / KZ
                </span>
              </div>
              <div className="document-actions">
                <button
                  className="ghost-button"
                  disabled={busy || meeting.status !== "ready"}
                  onClick={() => download("pdf")}
                >
                  <Download size={16} />
                  PDF
                </button>
                <button
                  className="text-button"
                  disabled={busy || meeting.status !== "ready"}
                  onClick={() => download("docx")}
                >
                  <Download size={16} />
                  DOCX
                </button>
                <button
                  className="text-button"
                  disabled={busy || meeting.status !== "ready"}
                  onClick={() => setReplacing(true)}
                >
                  <Sparkles size={16} />
                  Повторный анализ
                </button>
              </div>
            </div>
            {meeting.warnings.map((w, i) => (
              <div className="callout" key={i}>
                <ShieldCheck size={19} />
                <p>{w}</p>
              </div>
            ))}
            {meeting.status === "error" && (
              <div className="error-banner" role="alert">
                {meeting.error}
              </div>
            )}
            {["queued", "processing"].includes(meeting.status) && (
              <div className="processing">
                <Loader2 className="spin" />
                <div>
                  <h3>{stages[meeting.stage]}</h3>
                  <p>
                    Можно оставить страницу открытой. Результат появится
                    автоматически.
                  </p>
                  <progress max="100" value={meeting.progress} />
                </div>
              </div>
            )}
            {audioUrl && (
              <div className="audio-bar">
                <AudioLines />
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  preload="metadata"
                />
              </div>
            )}
            <Tabs
              value={tab}
              onValueChange={(v) => { setTab(String(v)); setQuery(""); setFilter("all"); setOwnerFilter("all"); }}
              className="document-tabs"
            >
              <TabsList variant="line">
                <TabsTrigger value="summary">Саммари</TabsTrigger>
                <TabsTrigger value="actions">
                  Поручения{" "}
                  <span className="tab-count">{meeting.actions.length}</span>
                </TabsTrigger>
                <TabsTrigger value="transcript">Транскрипт</TabsTrigger>
                <TabsTrigger value="people">Участники</TabsTrigger>
              </TabsList>
              <TabsContent value="summary">
                <div className="summary-layout">
                  <article className="summary-paper">
                    <span className="mini-label">
                      <Sparkles size={14} /> КРАТКО О ГЛАВНОМ
                    </span>
                    <h2>Что решили на встрече</h2>
                    {meeting.summary.map((s, i) => (
                      <div className="summary-point" key={i}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <p>{s}</p>
                      </div>
                    ))}
                    {meeting.summary.length === 0 && (
                      <p className="muted">Саммари появится после обработки.</p>
                    )}
                    <div className="summary-footer">
                      <ShieldCheck size={17} />
                      Проверьте формулировки перед использованием протокола.
                    </div>
                  </article>
                  <aside className="meeting-aside">
                    <div className="aside-block sky">
                      <ClipboardList size={25} />
                      <strong>{meeting.actions.length}</strong>
                      <h3>поручений зафиксировано</h3>
                      <p>
                        {meeting.actions.filter((a) => a.needs_review).length}{" "}
                        ожидают проверки секретарём
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setTab("actions")}
                      >
                        Перейти к поручениям <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="aside-block">
                      <h3>Важен каждый срок</h3>
                      <p>
                        Относительные сроки рассчитаны от{" "}
                        {fmt(meeting.meeting_date)}. Неоднозначные даты требуют
                        подтверждения.
                      </p>
                      <button
                        className="text-button"
                        onClick={() =>
                          perform(async () => {
                            setAudit(
                              await (
                                await api(`/meetings/${meeting.id}/audit`)
                              ).json(),
                            );
                            setNotice("Журнал обновлён");
                          })
                        }
                      >
                        Журнал изменений <ChevronRight size={15} />
                      </button>
                      {audit.slice(0, 5).map((a, i) => (
                        <small key={i}>
                          {auditLabels[a.event] || stages[a.event] || "Запись обновлена"} ·{" "}
                          {new Date(a.at).toLocaleTimeString("ru-RU")}
                        </small>
                      ))}
                    </div>
                  </aside>
                </div>
              </TabsContent>
              <TabsContent value="actions">
                {toolbar()}
                {taskTable(visibleTasks)}
              </TabsContent>
              <TabsContent value="transcript">
                <div className="transcript-head">
                  <h2>Транскрипт совещания</h2>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Поиск в транскрипте"
                      placeholder="Найти в разговоре"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="transcript">
                  {meeting.segments
                    .filter((s) =>
                      `${s.text} ${s.speaker}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((s, i) => (
                      <article
                        key={s.id}
                        id={"segment-" + s.id}
                        className="segment"
                      >
                        <span className={"avatar tone-" + (i % 4)}>
                          {initials(s.speaker)}
                        </span>
                        <div>
                          <div className="segment-header">
                            <strong>{s.speaker}</strong>
                            <span>{s.id}</span>
                            {s.start !== null && (
                              <button
                                className="timestamp"
                                onClick={() => {
                                  if (audioRef.current) {
                                    audioRef.current.currentTime = s.start!;
                                    audioRef.current.play().catch(() => {});
                                  }
                                }}
                              >
                                <Play size={11} />
                                {time(s.start)}
                              </button>
                            )}
                          </div>
                          <p>{s.text}</p>
                        </div>
                      </article>
                    ))}
                </div>
              </TabsContent>
              <TabsContent value="people">
                <div className="callout">
                  <Users size={20} />
                  <p>
                    Голосовые кластеры не определяют личность. Прослушайте
                    реплики и укажите имя участника. После сопоставления имён
                    можно повторить анализ.
                  </p>
                </div>
                <div className="people-grid">
                  {Array.from(
                    new Set(meeting.segments.map((s) => s.speaker)),
                  ).map((name, i) => (
                    <article className="person-card" key={name}>
                      <span className={"avatar large tone-" + (i % 4)}>
                        {initials(name)}
                      </span>
                      <h3>{name}</h3>
                      <p>
                        {
                          meeting.segments.filter((s) => s.speaker === name)
                            .length
                        }{" "}
                        реплик
                      </p>
                      <button
                        className="ghost-button"
                        onClick={() => setSpeaker({ old: name, name })}
                      >
                        Указать имя
                      </button>
                    </article>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
        {view === "detail" && !meeting && (
          <div className="empty">
            {loading ? <Loader2 className="spin" /> : <FolderOpen />}
            <h3>{loading ? "Загружаем совещание" : "Совещание не найдено"}</h3>
            {!loading && <button className="ghost-button" onClick={() => navigate("meetings")}>К списку совещаний</button>}
          </div>
        )}
        <footer>
          <a
            className="footer-brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("home");
            }}
          >
            gestspeak
          </a>
          <span>Протоколы и поручения · локальная обработка</span>
          <button className="text-button" onClick={() => setSettings(true)}>
            <Settings2 size={15} />
            Система
          </button>
        </footer>
      </main>
      <CreateMeeting
        open={create}
        initialMode={createMode}
        initialFile={pendingFile}
        onClose={() => {
          setCreate(false);
          setCreateMode("file");
          setPendingFile(null);
        }}
        api={api}
        onCreated={async (id) => {
          setCreate(false);
          setCreateMode("file");
          setPendingFile(null);
          await refresh();
          openMeeting(id);
        }}
        health={health}
      />
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="modal">
          <DialogTitle>Ваш локальный контур</DialogTitle>
          <DialogDescription>
            Состояние обработки и доступ к серверу GestSpeak.
          </DialogDescription>
          <div className="system-services">
            {[
              [
                "Распознавание речи",
                "Whisper · русский, казахский, смешанный",
                health?.asr,
              ],
              [
                "Различение говорящих",
                "Локальная модель · голоса и временные метки",
                health?.diarization,
              ],
              [
                "Извлечение поручений",
                health?.llm_model || "Ollama · локальная модель",
                health?.llm,
              ],
            ].map(([name, desc, ok], i) => (
              <div key={i}>
                <span className={"dot " + (ok ? "green" : "amber")} />
                <div>
                  <strong>{name}</strong>
                  <small>{desc}</small>
                </div>
                <span className="badge">
                  {ok ? "Настроено" : "Не подключено"}
                </span>
              </div>
            ))}
          </div>
          <p className="muted">
            При отсутствии моделей доступны демопример, ручная проверка и анализ
            явных поручений по правилам. Инструкция установки — в README
            репозитория.
          </p>
          <label className="field">
            Токен доступа к серверу
            <input
              type="password"
              value={token}
              autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
              placeholder="Если сервер требует авторизацию"
            />
          </label>
          <div className="modal-actions">
            <button
              className="primary"
              onClick={() => {
                tokenRef.current = token;
                refresh();
                checkHealth();
                setNotice("Настройки применены");
              }}
            >
              Применить
            </button>
            <button className="text-button" onClick={checkHealth}>
              Проверить состояние
            </button>
          </div>
          <small className="muted">
            Токен хранится только в памяти этой вкладки.
          </small>
          <a
            className="repo-link"
            href="https://github.com/BAITC-Hacks/hack-a7c30eea-gestspeak"
            target="_blank"
            rel="noreferrer"
          >
            Открыть репозиторий <ArrowUpRight size={15} />
          </a>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="modal wide">
          <DialogTitle>Проверка поручения</DialogTitle>
          <DialogDescription>
            Сопоставьте формулировку с источником и подтвердите решение.
          </DialogDescription>
          {editing && (
            <>
              <label className="field">
                Поручение
                <textarea
                  rows={3}
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <div className="form-row">
                <label className="field">
                  Ответственный
                  <input
                    value={editing.owner || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, owner: e.target.value })
                    }
                    placeholder="Имя или подразделение"
                  />
                </label>
                <label className="field">
                  Срок
                  <input
                    type="date"
                    value={editing.due_date || ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        due_date: e.target.value || null,
                      })
                    }
                  />
                </label>
              </div>
              <div className="source-quote">
                <span className="mini-label">
                  ИСТОЧНИК · {editing.evidence.join(", ")}
                </span>
                <blockquote>
                  «{editing.quote || "Цитата не определена"}»
                </blockquote>
                <p>Срок в разговоре: {editing.deadline_text || "не указан"}</p>
                <button
                  className="text-button"
                  onClick={() => {
                    openMeeting(editing.meeting_id);
                    setTab("transcript");
                    setQuery("");
                    const id = editing.evidence[0];
                    setEditing(null);
                    setTimeout(
                      () =>
                        document
                          .getElementById("segment-" + id)
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          }),
                      250,
                    );
                  }}
                >
                  Открыть реплики <ArrowUpRight size={16} />
                </button>
              </div>
              {editing.needs_review && (
                <p className="review-note">{editing.review_reason}</p>
              )}
              <div className="modal-actions">
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !editing.owner ||
                    !editing.due_date ||
                    editing.title.length < 3
                  }
                  onClick={() =>
                    perform(async () => {
                      await updateAction(editing.meeting_id, editing.id, {
                        title: editing.title,
                        owner: editing.owner,
                        due_date: editing.due_date,
                        needs_review: false,
                      });
                      setEditing(null);
                      setNotice("Поручение проверено и сохранено");
                    })
                  }
                >
                  <Check size={17} />
                  Подтвердить
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await updateAction(editing.meeting_id, editing.id, {
                        title: editing.title,
                        owner: editing.owner,
                        due_date: editing.due_date,
                      });
                      setEditing(null);
                      setNotice("Черновик сохранён");
                    })
                  }
                >
                  Сохранить черновик
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!speaker}
        onOpenChange={(open) => {
          if (!open) setSpeaker(null);
        }}
      >
        <DialogContent className="modal">
          <DialogTitle>Участник совещания</DialogTitle>
          <DialogDescription>
            Имя будет связано с репликами выбранного голоса.
          </DialogDescription>
          <label className="field">
            Имя
            <input
              value={speaker?.name || ""}
              onChange={(e) =>
                speaker && setSpeaker({ ...speaker, name: e.target.value })
              }
            />
          </label>
          <button
            className="primary"
            disabled={busy || !speaker?.name.trim()}
            onClick={() =>
              perform(async () => {
                await api(`/meetings/${meeting!.id}/speakers`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    speaker: speaker!.old,
                    name: speaker!.name,
                  }),
                });
                await refresh();
                setSpeaker(null);
              })
            }
          >
            Сохранить
          </button>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removing || replacing}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setReplacing(false);
          }
        }}
      >
        <AlertDialogContent className="modal">
          <AlertDialogTitle>
            {removing ? "Удалить совещание?" : "Повторить анализ?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {removing
              ? "Запись, протокол и поручения будут удалены с локального сервера."
              : "Новые результаты анализа заменят текущие поручения и их статусы. Сначала сохраните экспорт, если хотите оставить текущую редакцию."}
          </AlertDialogDescription>
          <div className="modal-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  if (removing) {
                    await api(`/meetings/${removing}`, { method: "DELETE" });
                    setRemoving(null);
                    setNotice("Совещание удалено");
                  } else {
                    await api(`/meetings/${meeting!.id}/reanalyze`, {
                      method: "POST",
                    });
                    setReplacing(false);
                  }
                  await refresh();
                })
              }
            >
              {removing ? "Удалить" : "Повторить анализ"}
            </button>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            aria-label="Закрыть уведомление"
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

type CreateProps = {
  open: boolean;
  initialMode: string;
  initialFile: File | null;
  onClose: () => void;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  onCreated: (id: string) => Promise<void>;
  health: Health | null;
};
function CreateMeeting({
  open,
  initialMode,
  initialFile,
  onClose,
  api,
  onCreated,
  health,
}: CreateProps) {
  const [mode, setMode] = useState("file");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [language, setLanguage] = useState("auto");
  const [participants, setParticipants] = useState("");
  const [count, setCount] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { if (open) { setMode(initialMode); setError(""); } }, [open, initialMode]);
  useEffect(() => {
    if (open && initialFile) {
      if (initialFile.size > 250 * 1024 * 1024) {
        setError("Максимальный размер файла — 250 МБ");
        return;
      }
      setFile(initialFile);
      setTitle(initialFile.name.replace(/\.[^.]+$/, ""));
      setMode("file");
      setError("");
    }
  }, [open, initialFile]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!recording) return;
    const start = Date.now();
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (!open && recorder.current?.state === "recording") {
      recorder.current.stop();
      setRecording(false);
    }
    if (!open) stream.current?.getTracks().forEach((t) => t.stop());
  }, [open]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function record() {
    setError("");
    try {
      if (!consent)
        throw new Error("Сначала подтвердите уведомление участников о записи.");
      if (!navigator.mediaDevices || typeof MediaRecorder === "undefined")
        throw new Error(
          "Запись недоступна в этом браузере. Загрузите аудиофайл.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      recorder.current = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      chunks.current = [];
      recorder.current.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      recorder.current.onstop = () => {
        const type = recorder.current?.mimeType || "audio/webm";
        const ext = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        setFile(new File(chunks.current, `meeting.${ext}`, { type }));
        setTitle((current) => current || `Совещание ${today()}`);
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recorder.current.onerror = () => {
        stream.current?.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setError("Запись прервалась. Проверьте доступ к микрофону и повторите попытку.");
      };
      recorder.current.start(1000);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    }
  }
  function choose(f: File | undefined) {
    if (!f) return;
    if (f.size > 250 * 1024 * 1024) {
      setError("Максимальный размер файла — 250 МБ");
      return;
    }
    setFile(f);
    setError("");
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let r: Response;
      if (mode === "text") {
        r = await api("/meetings/text", {
          method: "POST",
          body: JSON.stringify({
            title,
            meeting_date: date,
            transcript: text,
            participants: participants
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
            consent,
            language,
          }),
        });
      } else {
        if (!file) throw new Error("Добавьте запись совещания");
        const form = new FormData();
        form.append("file", file);
        form.append("title", title);
        form.append("meeting_date", date);
        form.append("consent", String(consent));
        form.append("language", language);
        form.append("participants", participants);
        if (count) form.append("speakers", count);
        r = await api("/meetings/audio", { method: "POST", body: form });
      }
      const m = await r.json();
      await onCreated(m.id);
      setFile(null);
      setText("");
      setTitle("");
      setConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="modal wide create-modal">
        <DialogTitle>Новое совещание</DialogTitle>
        <DialogDescription>
          Добавьте запись или текст — сохраним решения в одном месте.
        </DialogDescription>
        <form onSubmit={submit}>
          <Tabs
            value={mode}
            onValueChange={(v) => {
              if (!recording) setMode(String(v));
            }}
          >
            <TabsList>
              <TabsTrigger value="file">
                <Upload size={15} />
                Загрузить
              </TabsTrigger>
              <TabsTrigger value="record">
                <Mic size={15} />
                Записать
              </TabsTrigger>
              <TabsTrigger value="text">
                <FileText size={15} />
                Текст
              </TabsTrigger>
            </TabsList>
            <TabsContent value="file">
              <div
                className="file-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  choose(e.dataTransfer.files[0]);
                }}
              >
                <FileAudio size={30} />
                <strong>{file?.name || "Перетащите запись сюда"}</strong>
                <p>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} МБ`
                    : "WAV, MP3, M4A, MP4, WEBM, OGG, FLAC, MOV"}
                </p>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => fileInput.current?.click()}
                >
                  {file ? "Заменить файл" : "Выбрать файл"}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  aria-label="Файл записи"
                  accept=".wav,.mp3,.m4a,.mp4,.webm,.ogg,.flac,.mov"
                  onChange={(e) => choose(e.target.files?.[0])}
                />
              </div>
            </TabsContent>
            <TabsContent value="record">
              <div className="record-panel">
                <span
                  className={"record-icon " + (recording ? "recording" : "")}
                >
                  <Mic size={28} />
                </span>
                <strong>
                  {recording
                    ? time(elapsed)
                    : file
                      ? "Запись готова"
                      : "Запись с микрофона"}
                </strong>
                <p>
                  {recording
                    ? "Идёт запись. Участники должны быть уведомлены."
                    : "После остановки запись отправится на обработку по вашей команде."}
                </p>
                {recording ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => recorder.current?.stop()}
                  >
                    <Square size={15} />
                    Остановить
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!consent}
                    onClick={record}
                  >
                    {file ? "Записать заново" : "Начать запись"}
                  </button>
                )}
              </div>
            </TabsContent>
            <TabsContent value="text">
              <div className="sample-picker">
                <span>Тестовый разговор</span>
                <div>
                  {sampleTranscripts.map((sample) => (
                    <button type="button" className="sample-button" key={sample.id} onClick={() => {
                      setText(sample.text);
                      setTitle(sample.title);
                      setLanguage(sample.language);
                      setDate("2026-09-23");
                      setError("");
                    }}>{sample.label}</button>
                  ))}
                </div>
              </div>
              <label className="field">
                Транскрипт
                <textarea
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    "Асхат: Подготовить отчёт — ответственный Нурлан, срок до 15 октября.\nНурлан: Жақсы, сделаю."
                  }
                  maxLength={60000}
                />
              </label>
              <small className="muted">
                Формат: «Имя: реплика», каждый участник с новой строки.
              </small>
            </TabsContent>
          </Tabs>
          <div className="form-row">
            <label className="field">
              Название
              <input
                required
                maxLength={200}
                placeholder="Например, производственное совещание"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field date-field">
              Дата совещания
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              Язык речи
              <NativeSelect
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="auto">Авто · RU + KZ / смешанный</option>
                <option value="ru">Русский</option>
                <option value="kk">Қазақша</option>
              </NativeSelect>
            </label>
            <label className="field">
              Количество голосов
              <input
                type="number"
                min="1"
                max="30"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="Определить автоматически"
              />
            </label>
          </div>
          <label className="field">
            Участники <span className="optional">необязательно</span>
            <input
              placeholder="Имена через запятую"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
            />
          </label>
          <label className="consent">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(!!v)}
              aria-label="Участники уведомлены"
            />
            <span>
              Участники уведомлены о записи и обработке с помощью ИИ. У меня
              есть право использовать эти данные.
            </span>
          </label>
          {mode !== "text" && (!health?.asr || !health?.diarization) && (
            <p className="review-note">
              Для аудио необходимо установить локальные модели. Сейчас можно
              проверить сценарий на готовом тексте.
            </p>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="primary"
              type="submit"
              disabled={
                busy ||
                !consent ||
                recording ||
                !title.trim() ||
                (mode === "text" ? text.length < 20 : !file)
              }
            >
              {busy ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}
              Сформировать протокол
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={onClose}
            >
              Отмена
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
