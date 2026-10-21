import { describe, expect, it } from "vitest";
import {
  assert,
  canAccessAdmin,
  canChangeRole,
  canEditProfile,
  canEditProject,
  canFollow,
  canInteractWithProject,
  canModerate,
  canSetOwnVisibility,
  canViewProject,
  isAdmin,
  isSignedIn,
  PermissionError,
  type Viewer,
} from "@/lib/auth/permissions";
import type { ProjectStatus } from "@/lib/db/schema";

const alice: Viewer = { userId: "11111111-1111-4111-8111-111111111111", role: "user" };
const bob: Viewer = { userId: "22222222-2222-4222-8222-222222222222", role: "user" };
const admin: Viewer = { userId: "33333333-3333-4333-8333-333333333333", role: "admin" };
const anon: Viewer = null;

describe("permissions", () => {
  it("knows who is signed in and who is an admin", () => {
    expect(isSignedIn(anon)).toBe(false);
    expect(isSignedIn(alice)).toBe(true);
    expect(isAdmin(alice)).toBe(false);
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(anon)).toBe(false);
  });

  it("lets people edit only their own profile", () => {
    expect(canEditProfile(alice, alice!.userId)).toBe(true);
    expect(canEditProfile(alice, bob!.userId)).toBe(false);
    expect(canEditProfile(anon, alice!.userId)).toBe(false);
  });

  it("lets admins edit any profile for moderation", () => {
    expect(canEditProfile(admin, alice!.userId)).toBe(true);
  });

  it("only admins can change roles, and never their own", () => {
    expect(canChangeRole(alice, bob!.userId)).toBe(false);
    expect(canChangeRole(alice, alice!.userId)).toBe(false);
    expect(canChangeRole(anon, alice!.userId)).toBe(false);
    expect(canChangeRole(admin, alice!.userId)).toBe(true);
    expect(canChangeRole(admin, admin!.userId)).toBe(false);
  });

  it("gates the admin area", () => {
    expect(canAccessAdmin(anon)).toBe(false);
    expect(canAccessAdmin(alice)).toBe(false);
    expect(canAccessAdmin(admin)).toBe(true);
  });

  it("assert throws a PermissionError", () => {
    expect(() => assert(false)).toThrow(PermissionError);
    expect(() => assert(true)).not.toThrow();
  });
});

describe("project permissions", () => {
  const owner: Viewer = { userId: "44444444-4444-4444-8444-444444444444", role: "user" };
  const stranger: Viewer = { userId: "55555555-5555-4555-8555-555555555555", role: "user" };
  const mod: Viewer = { userId: "66666666-6666-4666-8666-666666666666", role: "admin" };
  const at = (status: ProjectStatus) => ({ ownerId: owner!.userId, status });
  const hidden: ProjectStatus[] = [
    "draft",
    "pending_review",
    "unpublished",
    "removed",
    "hidden_pending_review",
  ];

  it("published projects are visible to everyone", () => {
    for (const v of [null, owner, stranger, mod])
      expect(canViewProject(v, at("published"))).toBe(true);
  });

  it.each(hidden)("%s projects are visible only to the owner and admins", (status) => {
    expect(canViewProject(null, at(status))).toBe(false);
    expect(canViewProject(stranger, at(status))).toBe(false);
    expect(canViewProject(owner, at(status))).toBe(true);
    expect(canViewProject(mod, at(status))).toBe(true);
  });

  it("only owners edit, and not while an admin has the project removed or under review", () => {
    expect(canEditProject(owner, at("published"))).toBe(true);
    expect(canEditProject(owner, at("draft"))).toBe(true);
    expect(canEditProject(owner, at("removed"))).toBe(false);
    expect(canEditProject(owner, at("hidden_pending_review"))).toBe(false);
    expect(canEditProject(stranger, at("published"))).toBe(false);
    expect(canEditProject(mod, at("published"))).toBe(false);
  });

  it("owners toggle published/unpublished but can't undo admin decisions", () => {
    expect(canSetOwnVisibility(owner, at("published"), "unpublished")).toBe(true);
    expect(canSetOwnVisibility(owner, at("unpublished"), "published")).toBe(true);
    expect(canSetOwnVisibility(owner, at("removed"), "published")).toBe(false);
    expect(canSetOwnVisibility(owner, at("pending_review"), "published")).toBe(false);
    expect(canSetOwnVisibility(stranger, at("published"), "unpublished")).toBe(false);
  });

  it("likes and saves need a signed-in viewer and a public project", () => {
    expect(canInteractWithProject(null, at("published"))).toBe(false);
    expect(canInteractWithProject(stranger, at("published"))).toBe(true);
    expect(canInteractWithProject(owner, at("unpublished"))).toBe(false);
  });

  it("follows and moderation", () => {
    expect(canFollow(owner, stranger!.userId)).toBe(true);
    expect(canFollow(owner, owner!.userId)).toBe(false);
    expect(canFollow(null, owner!.userId)).toBe(false);
    expect(canModerate(owner)).toBe(false);
    expect(canModerate(mod)).toBe(true);
  });
});
