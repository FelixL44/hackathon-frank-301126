import { test } from "node:test";
import assert from "node:assert/strict";
import { requestDraft } from "./customer-request.ts";
import { appLanguage } from "./language.ts";

test("the app writes English unless APP_LANGUAGE picks a supported language", () => {
  assert.equal(appLanguage({}), "en");
  assert.equal(appLanguage({ APP_LANGUAGE: "pt" }), "pt");
  assert.equal(appLanguage({ APP_LANGUAGE: "klingon" }), "en");
});

test("request drafts come in the chosen language; a broker instruction replaces the template text", () => {
  assert.match(requestDraft("en", "CLM-1", "clearer_photo", ""), /^Hello,[\s\S]*CLM-1[\s\S]*sharper photo/);
  assert.match(requestDraft("pt", "CLM-1", "clearer_photo", ""), /^Olá,[\s\S]*CLM-1[\s\S]*fotografia mais nítida/);
  assert.match(requestDraft("en", "CLM-1", "other", "Please send the police report."), /Please send the police report\./);
});
