/**
 * PointPilot store — JSON-file persistence with no external dependencies.
 *
 * Every mutation is written atomically (temp file + rename), so a crashed
 * process never leaves a half-written database behind.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, REWARD_TYPES, rewards, surveys } from "./seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SURVEY_DB || path.join(here, "..", "data", "db.json");
const DAY_MS = 24 * 60 * 60 * 1000;

const LEVELS = [
  { name: "Newcomer", at: 0, emoji: "🌱" },
  { name: "Explorer", at: 300, emoji: "🧭" },
  { name: "Contributor", at: 800, emoji: "✍️" },
  { name: "Insider", at: 1500, emoji: "🔮" },
  { name: "Analyst", at: 3000, emoji: "📊" },
  { name: "Luminary", at: 6000, emoji: "🌟" },
];

const ACHIEVEMENTS = [
  {
    id: "first_survey",
    title: "First steps",
    desc: "Complete your first survey",
    icon: "🎯",
    check: (u) => u.stats.completed >= 1,
  },
  {
    id: "five_surveys",
    title: "On a roll",
    desc: "Complete 5 surveys",
    icon: "🔥",
    check: (u) => u.stats.completed >= 5,
  },
  {
    id: "ten_surveys",
    title: "Survey pro",
    desc: "Complete 10 surveys",
    icon: "🏅",
    check: (u) => u.stats.completed >= 10,
  },
  {
    id: "earned_1000",
    title: "Four figures",
    desc: "Earn 1,000 lifetime points",
    icon: "💎",
    check: (u) => u.stats.lifetimeEarned >= 1000,
  },
  {
    id: "first_reward",
    title: "Treat yourself",
    desc: "Redeem your first reward",
    icon: "🎁",
    check: (u) => u.stats.redemptions >= 1,
  },
  {
    id: "streak_3",
    title: "Warming up",
    desc: "Reach a 3-day streak",
    icon: "⚡",
    check: (u) => u.streak >= 3,
  },
  {
    id: "streak_7",
    title: "Week well spent",
    desc: "Reach a 7-day streak",
    icon: "📅",
    check: (u) => u.streak >= 7,
  },
  {
    id: "curious_mind",
    title: "Curious mind",
    desc: "Complete surveys in 4 categories",
    icon: "🧠",
    check: (u) => u.stats.categoriesExplored >= 4,
  },
];

const LEADERBOARD_BOTS = [
  { name: "Maya R.", emoji: "🦊", points: 1840 },
  { name: "Leo K.", emoji: "🐼", points: 1620 },
  { name: "Priya S.", emoji: "🦉", points: 1410 },
  { name: "Sam O.", emoji: "🐸", points: 1180 },
  { name: "Noor A.", emoji: "🐯", points: 940 },
  { name: "Alex D.", emoji: "🐨", points: 720 },
];

let db = loadDb();

function emptyDb() {
  return { version: 1, createdAt: new Date().toISOString(), users: {} };
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.users !== "object") {
      return emptyDb();
    }
    return parsed;
  } catch {
    return emptyDb();
  }
}

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(key, days) {
  return dateKey(new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS));
}

function validClientId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

export function ensureUser(clientId) {
  const id = validClientId(clientId) ? clientId : crypto.randomUUID();
  let user = db.users[id];
  if (!user) {
    user = {
      id,
      name: "Guest",
      emoji: "🙂",
      points: 0,
      lifetimeEarned: 0,
      streak: 0,
      lastActiveDate: null,
      lastBonusDate: null,
      createdAt: new Date().toISOString(),
      completed: {},
      progress: {},
      redemptions: [],
      activity: [],
      achievements: [],
    };
    db.users[id] = user;
    persist();
  }
  return user;
}

function levelFor(lifetimeEarned) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (lifetimeEarned >= LEVELS[i].at) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const span = next ? next.at - current.at : 1;
  const progress = next ? Math.min(1, (lifetimeEarned - current.at) / span) : 1;
  return {
    index,
    name: current.name,
    emoji: current.emoji,
    at: current.at,
    next: next ? { name: next.name, at: next.at } : null,
    progress,
    toNext: next ? Math.max(0, next.at - lifetimeEarned) : 0,
  };
}

function computeStats(user) {
  const completedIds = Object.keys(user.completed);
  const categories = new Set();
  let minutes = 0;
  for (const id of completedIds) {
    const survey = surveys.find((s) => s.id === id);
    if (!survey) continue;
    categories.add(survey.category);
    minutes += survey.minutes;
  }
  return {
    completed: completedIds.length,
    available: surveys.length,
    lifetimeEarned: user.lifetimeEarned,
    redemptions: user.redemptions.length,
    categoriesExplored: categories.size,
    totalCategories: CATEGORIES.length,
    minutes,
  };
}

function logActivity(user, type, label, points, meta = {}) {
  user.activity.unshift({
    id: crypto.randomUUID(),
    type,
    label,
    points,
    at: new Date().toISOString(),
    ...meta,
  });
  user.activity = user.activity.slice(0, 60);
}

function touchStreak(user) {
  const today = dateKey();
  if (user.lastActiveDate === today) return { changed: false, streak: user.streak };
  const yesterday = addDays(today, -1);
  user.streak = user.lastActiveDate === yesterday ? user.streak + 1 : 1;
  user.lastActiveDate = today;
  return { changed: true, streak: user.streak };
}

function dailyBonusAmount(user) {
  return 25 + Math.min(user.streak, 7) * 5;
}

function checkAchievements(user) {
  const unlocked = new Set(user.achievements.map((a) => a.id));
  const stats = computeStats(user);
  const context = { ...user, stats };
  const newlyUnlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    if (!achievement.check(context)) continue;
    const record = { id: achievement.id, at: new Date().toISOString() };
    user.achievements.push(record);
    newlyUnlocked.push(achievement);
  }
  return newlyUnlocked;
}

function publicSurvey(user, survey) {
  const completed = user.completed[survey.id];
  const draft = user.progress[survey.id];
  const answered = draft ? Object.keys(draft.answers || {}).length : 0;
  return {
    id: survey.id,
    title: survey.title,
    brand: survey.brand,
    emoji: survey.emoji,
    category: survey.category,
    categoryLabel: CATEGORIES.find((c) => c.id === survey.category)?.label || survey.category,
    reward: survey.reward,
    minutes: survey.minutes,
    questions: survey.questions.length,
    description: survey.description,
    featured: Boolean(survey.featured),
    tag: survey.tag || null,
    completed: Boolean(completed),
    completedAt: completed?.completedAt || null,
    started: Boolean(draft),
    progress: completed ? 1 : Math.min(1, answered / survey.questions.length),
  };
}

function categoryBreakdown(user) {
  return CATEGORIES.map((category) => {
    const list = surveys.filter((s) => s.category === category.id);
    const done = list.filter((s) => user.completed[s.id]).length;
    return { ...category, total: list.length, completed: done };
  });
}

export function buildState(user) {
  const stats = computeStats(user);
  const level = levelFor(user.lifetimeEarned);
  const today = dateKey();
  const surveyList = surveys.map((s) => publicSurvey(user, s));
  const rewardList = rewards.map((r) => ({
    ...r,
    affordable: user.points >= r.cost,
    redeemedCount: user.redemptions.filter((red) => red.rewardId === r.id).length,
  }));
  const achievements = ACHIEVEMENTS.map((a) => {
    const record = user.achievements.find((x) => x.id === a.id);
    return {
      id: a.id,
      title: a.title,
      desc: a.desc,
      icon: a.icon,
      unlocked: Boolean(record),
      unlockedAt: record?.at || null,
    };
  });
  const leaderboard = [
    ...LEADERBOARD_BOTS.map((bot) => ({ ...bot, isYou: false })),
    { name: user.name, emoji: user.emoji, points: user.points, isYou: true },
  ]
    .sort((a, b) => b.points - a.points)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return {
    user: {
      id: user.id,
      name: user.name,
      emoji: user.emoji,
      points: user.points,
      lifetimeEarned: user.lifetimeEarned,
      streak: user.streak,
      memberSince: user.createdAt,
    },
    level,
    stats,
    dailyBonus: {
      claimable: user.lastBonusDate !== today,
      amount: dailyBonusAmount(user),
    },
    surveys: surveyList,
    categories: categoryBreakdown(user),
    rewards: rewardList,
    rewardTypes: REWARD_TYPES,
    achievements,
    leaderboard,
    activity: user.activity,
    redemptions: user.redemptions,
  };
}

export function getSurvey(clientId, surveyId) {
  const user = ensureUser(clientId);
  const survey = surveys.find((s) => s.id === surveyId);
  if (!survey) return null;
  const draft = user.progress[surveyId];
  return {
    ...survey,
    questions: survey.questions.map((q) => ({ ...q })),
    completed: Boolean(user.completed[surveyId]),
    savedAnswers: draft?.answers || {},
    startQuestion: draft?.currentQuestion || 0,
  };
}

export function startSurvey(clientId, surveyId) {
  const user = ensureUser(clientId);
  const survey = surveys.find((s) => s.id === surveyId);
  if (!survey) return { error: "Survey not found", status: 404 };
  if (user.completed[surveyId]) return { error: "You already completed this survey", status: 409 };
  if (!user.progress[surveyId]) {
    user.progress[surveyId] = { answers: {}, currentQuestion: 0, startedAt: new Date().toISOString() };
    persist();
  }
  return { ok: true, progress: user.progress[surveyId] };
}

export function saveProgress(clientId, surveyId, answers, currentQuestion) {
  const user = ensureUser(clientId);
  const survey = surveys.find((s) => s.id === surveyId);
  if (!survey) return { error: "Survey not found", status: 404 };
  if (user.completed[surveyId]) return { error: "Survey already completed", status: 409 };
  const draft = user.progress[surveyId] || {
    startedAt: new Date().toISOString(),
  };
  draft.answers = isPlainObject(answers) ? answers : {};
  draft.currentQuestion = Number.isInteger(currentQuestion) ? currentQuestion : 0;
  draft.updatedAt = new Date().toISOString();
  user.progress[surveyId] = draft;
  persist();
  return { ok: true };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function answerIsValid(question, answer) {
  if (answer === undefined || answer === null) return false;
  switch (question.type) {
    case "single":
      return typeof answer === "string" && question.options.includes(answer);
    case "multi":
      return (
        Array.isArray(answer) &&
        answer.length > 0 &&
        answer.every((a) => typeof a === "string" && question.options.includes(a))
      );
    case "scale":
      return Number.isInteger(answer) && answer >= 1 && answer <= 5;
    case "rating":
      return Number.isInteger(answer) && answer >= 1 && answer <= 5;
    case "text":
      return typeof answer === "string" && answer.trim().length > 0;
    default:
      return false;
  }
}

function validateAnswers(survey, answers) {
  const missing = [];
  for (const question of survey.questions) {
    if (!question.required) continue;
    if (!answerIsValid(question, answers?.[question.id])) missing.push(question.id);
  }
  return missing;
}

export function completeSurvey(clientId, surveyId, answers, durationSeconds) {
  const user = ensureUser(clientId);
  const survey = surveys.find((s) => s.id === surveyId);
  if (!survey) return { error: "Survey not found", status: 404 };
  if (user.completed[surveyId]) {
    return { error: "You already completed this survey", status: 409 };
  }
  const missing = validateAnswers(survey, answers);
  if (missing.length > 0) {
    return { error: "Please answer every required question", status: 422, missing };
  }

  const now = new Date().toISOString();
  const streakResult = touchStreak(user);
  user.points += survey.reward;
  user.lifetimeEarned += survey.reward;
  user.completed[surveyId] = {
    completedAt: now,
    points: survey.reward,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds)) : null,
    answers,
  };
  delete user.progress[surveyId];
  logActivity(user, "earn", `Completed “${survey.title}”`, survey.reward, {
    surveyId,
    brand: survey.brand,
    emoji: survey.emoji,
  });

  const stats = computeStats(user);
  const unlocked = checkAchievements(user);
  persist();

  return {
    ok: true,
    pointsAwarded: survey.reward,
    streak: user.streak,
    streakIncreased: streakResult.changed,
    newlyUnlocked: unlocked,
    state: buildState(user),
    balance: user.points,
    completed: stats.completed,
  };
}

export function claimDailyBonus(clientId) {
  const user = ensureUser(clientId);
  const today = dateKey();
  if (user.lastBonusDate === today) {
    return { error: "Today's bonus is already claimed — come back tomorrow", status: 409 };
  }
  const streakResult = touchStreak(user);
  const amount = dailyBonusAmount(user);
  user.lastBonusDate = today;
  user.points += amount;
  user.lifetimeEarned += amount;
  logActivity(user, "bonus", `Daily streak bonus · day ${user.streak}`, amount, { emoji: "🔥" });
  const unlocked = checkAchievements(user);
  persist();
  return {
    ok: true,
    amount,
    streak: user.streak,
    streakIncreased: streakResult.changed,
    newlyUnlocked: unlocked,
    state: buildState(user),
  };
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `PP-${chunk()}-${chunk()}`;
}

export function redeemReward(clientId, rewardId) {
  const user = ensureUser(clientId);
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) return { error: "Reward not found", status: 404 };
  if (user.points < reward.cost) {
    return {
      error: `You need ${reward.cost - user.points} more points for this reward`,
      status: 400,
      shortfall: reward.cost - user.points,
    };
  }
  user.points -= reward.cost;
  const redemption = {
    id: crypto.randomUUID(),
    rewardId: reward.id,
    title: reward.title,
    subtitle: reward.subtitle,
    emoji: reward.emoji,
    cost: reward.cost,
    value: reward.value,
    type: reward.type,
    code: makeCode(),
    at: new Date().toISOString(),
  };
  user.redemptions.unshift(redemption);
  logActivity(user, "spend", `Redeemed ${reward.title}`, -reward.cost, {
    emoji: reward.emoji,
    redemptionId: redemption.id,
  });
  const unlocked = checkAchievements(user);
  persist();
  return {
    ok: true,
    redemption,
    newlyUnlocked: unlocked,
    state: buildState(user),
  };
}

export function updateProfile(clientId, { name, emoji } = {}) {
  const user = ensureUser(clientId);
  if (typeof name === "string") {
    const trimmed = name.trim().slice(0, 32);
    if (trimmed.length > 0) user.name = trimmed;
  }
  if (typeof emoji === "string" && emoji.trim().length > 0) {
    user.emoji = [...emoji.trim()].slice(0, 2).join("").slice(0, 8);
  }
  const unlocked = checkAchievements(user);
  persist();
  return { ok: true, newlyUnlocked: unlocked, state: buildState(user) };
}

export function resetUser(clientId) {
  const user = ensureUser(clientId);
  delete db.users[user.id];
  persist();
  const fresh = ensureUser(user.id);
  return { ok: true, state: buildState(fresh) };
}

export function getMeta() {
  return { categories: CATEGORIES, rewardTypes: REWARD_TYPES, surveyCount: surveys.length };
}

export function closeStore() {
  persist();
}
