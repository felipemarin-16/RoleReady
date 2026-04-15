import { STORAGE_KEYS } from "@/lib/constants";
import type { FinalReport, InterviewSession, SetupSession } from "@/lib/types";

const canUseStorage = () => typeof window !== "undefined";

export function saveSetupSession(setup: SetupSession) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEYS.setup, JSON.stringify(setup));
}

export function getSetupSession() {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEYS.setup);
  return raw ? (JSON.parse(raw) as SetupSession) : null;
}

export function saveInterviewSession(interview: InterviewSession) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEYS.interview, JSON.stringify(interview));
}

export function getInterviewSession() {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEYS.interview);
  return raw ? (JSON.parse(raw) as InterviewSession) : null;
}

export function saveFinalReport(report: FinalReport) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEYS.report, JSON.stringify(report));
}

export function getFinalReport() {
  if (!canUseStorage()) {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEYS.report);
  return raw ? (JSON.parse(raw) as FinalReport) : null;
}

export function clearRoleReadySession() {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEYS.setup);
  window.sessionStorage.removeItem(STORAGE_KEYS.interview);
  window.sessionStorage.removeItem(STORAGE_KEYS.report);
}
