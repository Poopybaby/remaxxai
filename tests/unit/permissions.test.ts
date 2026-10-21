import { describe, expect, it } from "vitest";
import {
  assert,
  canAccessAdmin,
  canChangeRole,
  canEditProfile,
  isAdmin,
  isSignedIn,
  PermissionError,
  type Viewer,
} from "@/lib/auth/permissions";

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
