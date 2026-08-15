'use strict';

// Sekcija 23: status kartice na početnoj strani "MOJI SPOTOVI". Status se IZVODI iz stvarnog
// stanja projekta (progress polja, prisustvo audio/lyrics/storyboard) — nikad se ručno ne
// postavlja, da ne dođe do neusklađenosti između prikazanog statusa i stvarnog napretka.

const STATUS = Object.freeze({
  NEW: 'novi_projekat',
  ANALYZING: 'analiza_u_toku',
  LYRICS_NEEDS_REVIEW: 'tekst_trazi_proveru',
  WAITING_CONCEPT: 'ceka_izbor_koncepta',
  STORYBOARD_NEEDS_CONFIRM: 'storyboard_trazi_potvrdu',
  STORYBOARD_DONE: 'storyboard_zavrsen',
  IMAGE_PROMPTS_IN_PROGRESS: 'promptovi_u_toku',
  IMAGES_IN_PROGRESS: 'slike_u_toku',
  VIDEO_PROMPTS_IN_PROGRESS: 'video_promptovi_u_toku',
  READY_FOR_EDIT: 'spreman_za_montazu',
  ARCHIVED: 'arhiviran',
  ERROR: 'greska'
});

function computeProjectStatus(project) {
  if (!project) return STATUS.NEW;
  if (project.archived) return STATUS.ARCHIVED;
  if (project.lastError) return STATUS.ERROR;

  if (!project.audio) return STATUS.NEW;
  if (!project.lyrics || !project.lyrics.lines?.length) return STATUS.ANALYZING;
  if (project.lyrics.needsReview) return STATUS.LYRICS_NEEDS_REVIEW;
  if (!project.activeConceptId) return STATUS.WAITING_CONCEPT;
  if (!project.storyboard?.scenes?.length) return STATUS.STORYBOARD_NEEDS_CONFIRM;
  if (!project.storyboardConfirmed) return STATUS.STORYBOARD_DONE;

  const imagePromptsDone = project.progress?.imagePrompts >= 100;
  const imagesDone = project.progress?.images >= 100;
  const videoPromptsDone = project.progress?.videoPrompts >= 100;

  if (!imagePromptsDone) return STATUS.IMAGE_PROMPTS_IN_PROGRESS;
  if (!imagesDone) return STATUS.IMAGES_IN_PROGRESS;
  if (!videoPromptsDone) return STATUS.VIDEO_PROMPTS_IN_PROGRESS;
  return STATUS.READY_FOR_EDIT;
}

// Ukupan procenat napretka — prost prosek svih progress polja (sekcija 23: "ukupni procenat").
function computeOverallProgress(project) {
  const progress = project?.progress;
  if (!progress) return 0;
  const values = Object.values(progress).filter(v => Number.isFinite(v));
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

module.exports = { STATUS, computeProjectStatus, computeOverallProgress };
