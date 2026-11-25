// Pure helpers for connector-based Chat/Work updates. No network, shell or packages required.
export const SCHEMA_VERSION = 2;
const copy = value => JSON.parse(JSON.stringify(value));
const scans = ['pending', 'running', 'partial', 'complete', 'blocked'];
const writes = ['none', 'ready', 'committed', 'no_change'];
export function createProgress({date, cutoff, chatDates = []}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !cutoff) throw Error('date/cutoff required');
  const order = ['news', 'blogNews', 'cafe',
    ...['ahyeonddu','philipcommunications','yoonyoung17','miryeo2032','heros0694','joyland7499'].map(id => 'blogger:' + id),
    'seoul', ...chatDates.map(day => 'chat:' + day),
    'nearby1', 'nearby2', 'nearby3', 'premium3', 'premium2', 'deployment'];
  return {schemaVersion: SCHEMA_VERSION, date, cutoff, order, successfulRoutes:{}, tasks: Object.fromEntries(order.map(key => [key, {
    scanStatus:'pending', writeStatus:'none', cursor:null, nextAction:null,
    counts:{added:null, reviewed:null}, attempts:[], evidence:[], reason:null
  }]))};
}
export function isFinished(task) {
  return task.scanStatus === 'complete' && ['committed','no_change'].includes(task.writeStatus);
}
export function nextTask(progress, runId, now = new Date().toISOString()) {
  const ready = progress.order.find(key => progress.tasks[key].writeStatus === 'ready');
  if (ready) return ready;
  const failures = ['rate_limited','access_denied','login_required','request_failed','not_found_or_redirect','shell_or_incomplete','failed'];
  for (const key of progress.order) {
    const task = progress.tasks[key];
    if (isFinished(task)) continue;
    const tries = (task.attempts || []).filter(a => a.runId === runId && failures.includes(a.outcome)).length;
    if (tries >= 2 || task.deferRunId === runId) continue;
    if (task.retryAfter && Date.parse(task.retryAfter) > Date.parse(now)) continue;
    return key;
  }
  return null;
}
export function recordStep(progress, key, patch, now = new Date().toISOString()) {
  if (!progress.tasks[key]) throw Error('Unknown task: ' + key);
  const next = copy(progress);
  const task = {...next.tasks[key], ...copy(patch), updatedAt:now};
  if (!scans.includes(task.scanStatus) || !writes.includes(task.writeStatus)) throw Error('Invalid state');
  if (task.scanStatus !== 'complete' && task.writeStatus === 'no_change') throw Error('Incomplete scan cannot be no_change');
  if (['partial','blocked'].includes(task.scanStatus) && !task.reason) throw Error('Reason required');
  if (['partial','blocked'].includes(task.scanStatus) && !task.nextAction) throw Error('Resume action required');
  if (task.writeStatus === 'committed' && !task.commitSha) throw Error('Verified data commit SHA required');
  if (task.scanStatus === 'complete' && task.counts.added === null) throw Error('Completed scan requires counts');
  next.tasks[key] = task;
  next.updatedAt = now;
  return next;
}
export function recordAttempt(progress, key, {runId, routeKey, outcome, retryAfter = null}, now = new Date().toISOString()) {
  const task = progress.tasks[key];
  if (!task || !runId || !routeKey) throw Error('Task/run/route required');
  const same = (task.attempts || []).some(a => a.runId === runId && a.routeKey === routeKey);
  if (same) throw Error('Do not repeat identical failing route in one run');
  const attempts = [...(task.attempts || []), {runId, routeKey, outcome, at:now}];
  return recordStep(progress, key, {...task, attempts,
    ...(outcome === 'rate_limited' ? {scanStatus:'blocked', reason:'HTTP 429', nextAction:'Retry after server cooldown; do not rotate identities or repeat requests', deferRunId:runId, retryAfter} : {})
  }, now);
}
export function classifyFetch({httpStatus, loginRequired = false, truncated = false,
  hasBody = false, hasTitle = false, hasDate = false, explicitEmpty = false}) {
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus === 403) return 'access_denied';
  if (loginRequired) return 'login_required';
  if (truncated) return 'truncated';
  if (httpStatus === 404) return 'not_found_or_redirect';
  if (httpStatus !== 200) return 'request_failed';
  if (explicitEmpty) return 'empty_confirmed';
  return hasBody && hasTitle && hasDate ? 'candidate' : 'shell_or_incomplete';
}
export function canonicalKey(url) {
  const parsed = new URL(url);
  const blog = parsed.hostname.match(/^(?:m\.)?blog\.naver\.com$/);
  if (blog) {
    const match = parsed.pathname.match(/^\/([^/]+)\/(\d+)$/);
    const id = match ? match[1] : parsed.searchParams.get('blogId');
    const number = match ? match[2] : parsed.searchParams.get('logNo');
    if (id && number) return 'blog:' + id + ':' + number;
  }
  const news = parsed.hostname === 'n.news.naver.com' && parsed.pathname.match(/\/(?:mnews\/)?article\/(\d+)\/(\d+)/);
  if (news) return 'naver-news:' + news[1] + ':' + news[2];
  const cafe = /^(?:m\.)?cafe\.naver\.com$/.test(parsed.hostname) && parsed.pathname.match(/^\/([^/]+)\/(\d+)$/);
  if (cafe) return 'cafe:' + cafe[1] + ':' + cafe[2];
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_|^(?:referrerCode|trackingCode|navType|sm|from)$/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.searchParams.sort();
  return parsed.toString();
}
export function validateBatch(records, {cutoffDate, reviewed, categoryNo = null}) {
  if (!reviewed) throw Error('Original-source review required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) throw Error('Cutoff date required');
  for (const record of records) {
    if (!record.title || !record.url || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) throw Error('title/url/date required');
    const parsedDate = new Date(record.date + 'T00:00:00Z');
    if (isNaN(parsedDate) || parsedDate.toISOString().slice(0,10) !== record.date || record.date > cutoffDate) throw Error('Invalid date or after cutoff');
    if (!/^https?:$/.test(new URL(record.url).protocol)) throw Error('Public HTTP(S) source required');
    if (categoryNo !== null && record.categoryNo !== categoryNo) throw Error('Wrong category');
  }
  return true;
}
export function mergeRecords(existing, incoming) {
  const known = new Set(existing.map(record => canonicalKey(record.url)));
  const added = [];
  for (const record of incoming) {
    const key = canonicalKey(record.url);
    if (!known.has(key)) { known.add(key); added.push(copy(record)); }
  }
  return {added, records:[...added, ...copy(existing)].sort((a,b) => (b.date || '').localeCompare(a.date || ''))};
}
