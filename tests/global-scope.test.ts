import {describe,expect,it} from "vitest";
import {
  denyAllSupervisorPermissions,
  sensitivePermissionAllowed,
  mergeFeatures,
  contractStatus,
} from "../apps/api/src/services/commercial-rules";
import {sanitizeAuditData} from "../apps/api/src/utils/audit";

describe("global SaaS scope security",()=>{
  it("fails closed when a supervisor has no permission record",()=>{
    expect(Object.values(denyAllSupervisorPermissions).every(v=>v==="none")).toBe(true);
  });

  it("requires explicit granular permission for sensitive actions",()=>{
    expect(sensitivePermissionAllowed({},"points.adjust")).toBe(false);
    expect(sensitivePermissionAllowed({"points.adjust":true},"points.adjust")).toBe(true);
    expect(sensitivePermissionAllowed({"points.adjust":false},"points.adjust")).toBe(false);
  });

  it("merges new commercial resources with explicit overrides",()=>{
    const result=mergeFeatures({audit:false,overtime:false},{audit:true},{overtime:true});
    expect(result.audit).toBe(true);
    expect(result.overtime).toBe(true);
  });

  it("recognizes only supported contract states",()=>{
    expect(contractStatus("SIGNED")).toBe("SIGNED");
    expect(()=>contractStatus("APPROVED")).toThrow();
  });
});

describe("administrative audit sanitization",()=>{
  it("redacts secrets recursively before persistence",()=>{
    expect(sanitizeAuditData({
      password:"secret",
      jwt:"abc",
      nested:{smtpPassword:"mail",safe:"ok"},
      token:"bearer",
      biometricImage:"raw",
    })).toEqual({
      password:"[REDACTED]",
      jwt:"[REDACTED]",
      nested:{smtpPassword:"[REDACTED]",safe:"ok"},
      token:"[REDACTED]",
      biometricImage:"[REDACTED]",
    });
  });
});
