import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dbPath = path.join(os.tmpdir(), `pointpilot-test-${process.pid}-${Date.now()}.json`);
process.env.SURVEY_DB = dbPath;

const store = await import("../server/store.js");

const CLIENT = "test-client-0001";

function answersFor(questions) {
  const answers = {};
  for (const question of questions) {
    switch (question.type) {
      case "single":
        answers[question.id] = question.options[0];
        break;
      case "multi":
        answers[question.id] = [question.options[0], question.options[1]].filter(Boolean);
        break;
      case "scale":
      case "rating":
        answers[question.id] = 4;
        break;
      case "text":
        answers[question.id] = "A thoughtful answer.";
        break;
      default:
        break;
    }
  }
  return answers;
}

function completeAnySurvey(clientId = CLIENT, surveyId = "coffee-rituals") {
  const survey = store.getSurvey(clientId, surveyId);
  return store.completeSurvey(clientId, surveyId, answersFor(survey.questions), 60);
}

function completeOne(surveyId, clientId = CLIENT) {
  const survey = store.getSurvey(clientId, surveyId);
  return store.completeSurvey(clientId, surveyId, answersFor(survey.questions), 60);
}

function earnUntil(points, clientId = CLIENT) {
  const ids = ["streaming-habits", "sneaker-shopping", "ai-at-work", "dream-vacation", "money-habits"];
  let balance = store.buildState(store.ensureUser(clientId)).user.points;
  for (const id of ids) {
    if (balance >= points) break;
    const survey = store.buildState(store.ensureUser(clientId)).surveys.find((s) => s.id === id);
    if (!survey || survey.completed) continue;
    const result = completeOne(id, clientId);
    if (result.ok) balance = result.balance;
  }
  return balance;
}

test.after(() => {
  fs.rmSync(dbPath, { force: true });
});

test("a new user starts empty with the full catalog available", () => {
  const state = store.buildState(store.ensureUser(CLIENT));
  assert.equal(state.user.points, 0);
  assert.equal(state.stats.completed, 0);
  assert.ok(state.surveys.length >= 8);
  assert.ok(state.rewards.length >= 8);
  assert.equal(state.level.name, "Newcomer");
});

test("surveys hide their question list from the listing but expose it on detail", () => {
  const state = store.buildState(store.ensureUser(CLIENT));
  assert.equal(typeof state.surveys[0].questions, "number");
  const detail = store.getSurvey(CLIENT, "coffee-rituals");
  assert.ok(Array.isArray(detail.questions));
  assert.equal(detail.questions.length, 4);
});

test("incomplete answers are rejected", () => {
  const result = store.completeSurvey(CLIENT, "coffee-rituals", {}, 30);
  assert.equal(result.status, 422);
  assert.ok(result.missing.length > 0);
});

test("completing a survey awards points and records the completion", () => {
  const before = store.buildState(store.ensureUser(CLIENT));
  const result = completeAnySurvey();
  assert.equal(result.ok, true);
  assert.equal(result.pointsAwarded, 90);
  assert.equal(result.balance, 90);
  assert.equal(result.state.stats.completed, 1);
  assert.equal(result.state.user.streak, 1);
  assert.equal(result.state.activity[0].type, "earn");
});

test("a survey cannot be completed twice", () => {
  const again = completeAnySurvey();
  assert.equal(again.status, 409);
});

test("progress is saved and restored for an unfinished survey", () => {
  store.startSurvey(CLIENT, "ai-at-work");
  const answers = { q1: "Every day", q2: ["Research"] };
  store.saveProgress(CLIENT, "ai-at-work", answers, 1);
  const survey = store.getSurvey(CLIENT, "ai-at-work");
  assert.deepEqual(survey.savedAnswers, answers);
  assert.equal(survey.startQuestion, 1);
});

test("rewards cannot be redeemed without enough points", () => {
  const result = store.redeemReward(CLIENT, "audio-credit");
  assert.equal(result.status, 400);
  assert.ok(result.shortfall > 0);
});

test("redeeming a reward deducts points and issues a code", () => {
  const balance = earnUntil(320);
  assert.ok(balance >= 320, `expected at least 320 points, got ${balance}`);
  const before = store.buildState(store.ensureUser(CLIENT));
  const result = store.redeemReward(CLIENT, "coffee");
  assert.equal(result.ok, true);
  assert.match(result.redemption.code, /^PP-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(result.state.user.points, before.user.points - 300);
  assert.equal(result.state.redemptions.length, 1);
  assert.equal(result.state.activity[0].type, "spend");
});

test("daily bonus can only be claimed once per day", () => {
  const first = store.claimDailyBonus(CLIENT);
  assert.equal(first.ok, true);
  assert.ok(first.amount > 0);
  const second = store.claimDailyBonus(CLIENT);
  assert.equal(second.status, 409);
  assert.equal(store.buildState(store.ensureUser(CLIENT)).dailyBonus.claimable, false);
});

test("achievements unlock as milestones are hit", () => {
  const state = store.buildState(store.ensureUser(CLIENT));
  const unlocked = state.achievements.filter((a) => a.unlocked).map((a) => a.id);
  assert.ok(unlocked.includes("first_survey"));
  assert.ok(unlocked.includes("first_reward"));
  assert.ok(state.achievements.every((a) => typeof a.unlocked === "boolean"));
});

test("profile updates are reflected in state and survive sanitisation", () => {
  const result = store.updateProfile(CLIENT, { name: "  Sam  ", emoji: "🦊" });
  assert.equal(result.state.user.name, "Sam");
  assert.equal(result.state.user.emoji, "🦊");

  const long = store.updateProfile(CLIENT, { name: "x".repeat(80) });
  assert.equal(long.state.user.name.length, 32);
});

test("state is persisted to disk and reloads intact", async () => {
  const saved = store.buildState(store.ensureUser(CLIENT));
  store.closeStore();
  assert.ok(fs.existsSync(dbPath));
  const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  assert.ok(raw.users[CLIENT]);
  assert.equal(raw.users[CLIENT].points, saved.user.points);

  const fresh = await import(`../server/store.js?reload=${Date.now()}`);
  const reloaded = fresh.buildState(fresh.ensureUser(CLIENT));
  assert.equal(reloaded.user.points, saved.user.points);
  assert.equal(reloaded.stats.completed, saved.stats.completed);
  assert.equal(reloaded.redemptions.length, saved.redemptions.length);
});

test("users are isolated from one another", () => {
  const other = store.buildState(store.ensureUser("test-client-0002"));
  assert.equal(other.user.points, 0);
  assert.equal(other.stats.completed, 0);
});

test("reset clears a user's history", () => {
  const result = store.resetUser(CLIENT);
  assert.equal(result.state.user.points, 0);
  assert.equal(result.state.stats.completed, 0);
  assert.equal(result.state.redemptions.length, 0);
  assert.equal(result.state.activity.length, 0);
});
