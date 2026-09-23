from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import date


class Segment(BaseModel):
    id: str
    speaker: str = "SPEAKER_UNKNOWN"
    text: str
    start: Optional[float] = None
    end: Optional[float] = None


class Action(BaseModel):
    id: str = ""
    title: str = Field(min_length=3, max_length=2000)
    owner: Optional[str] = None
    deadline_text: str = ""
    due_date: Optional[date] = None
    due_start: Optional[date] = None
    topic: str = "Общее"
    priority: Literal["normal", "high"] = "normal"
    status: Literal["open", "in_progress", "done"] = "open"
    evidence: List[str] = Field(default_factory=list)
    quote: str = ""
    needs_review: bool = True
    review_reason: str = ""


class Analysis(BaseModel):
    summary: List[str] = Field(default_factory=list, max_length=12)
    actions: List[Action] = Field(default_factory=list, max_length=100)


class TextInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    meeting_date: date
    transcript: str = Field(min_length=20, max_length=60000)
    participants: List[str] = Field(default_factory=list, max_length=50)
    consent: bool = False
    language: Literal["auto", "ru", "kk"] = "auto"


class ActionPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=2000)
    owner: Optional[str] = Field(default=None, max_length=200)
    due_date: Optional[date] = None
    status: Optional[Literal["open", "in_progress", "done"]] = None
    needs_review: Optional[bool] = None


class SpeakerPatch(BaseModel):
    speaker: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
