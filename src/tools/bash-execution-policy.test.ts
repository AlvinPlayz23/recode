/**
 * Tests for Bash execution policy validation.
 */

import { describe, expect, it } from "bun:test";
import { validateCommandForGuardedDirectExecution } from "./bash-execution-policy.ts";

const WORKSPACE = "/tmp/recode-sandbox-test";

describe("validateCommandForGuardedDirectExecution", () => {
  it("allows simple commands covered by app-layer validation", () => {
    expect(validateCommandForGuardedDirectExecution("echo hello", WORKSPACE)).toBeNull();
  });

  it("rejects command substitution when no OS sandbox is available", () => {
    const result = validateCommandForGuardedDirectExecution("echo $(cat secret.txt)", WORKSPACE);
    expect(result).toContain("bubblewrap");
  });

  it("rejects backtick command substitution when no OS sandbox is available", () => {
    const result = validateCommandForGuardedDirectExecution("echo `cat secret.txt`", WORKSPACE);
    expect(result).toContain("bubblewrap");
  });

  it("keeps existing workspace escape validation", () => {
    const result = validateCommandForGuardedDirectExecution("cat ../../secret", WORKSPACE);
    expect(result).toContain("../../secret");
  });
});
