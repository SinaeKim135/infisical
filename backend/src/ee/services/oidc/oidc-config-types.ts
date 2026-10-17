import { TGenericPermission } from "@app/lib/types";

export enum OIDCConfigurationType {
  CUSTOM = "custom",
  DISCOVERY_URL = "discoveryURL"
}

export enum OIDCJWTSignatureAlgorithm {
  RS256 = "RS256",
  HS256 = "HS256",
  RS512 = "RS512",
  EDDSA = "EdDSA"
}

export type TOidcLoginDTO = {
  externalId: string;
  email: string;
  firstName: string;
  lastName?: string;
  orgId: string;
  ip: string;
  userAgent: string;
  callbackPort?: string;
  groups?: string[];
  manageGroupMemberships?: boolean | null;
  // Refresh token issued by the IdP (only present when offline_access was granted).
  // Persisted so the recurring reconciliation job can re-fetch group claims without a new login.
  refreshToken?: string;
  groupMembershipReconciliationEnabled?: boolean | null;
};

export type TOidcGroupReconciliationSummary = {
  orgId: string;
  status: "success" | "partial" | "failed" | "skipped";
  message: string;
  checked: number;
  membershipsRemoved: number;
  skipped: number;
  failed: number;
};

export type TGetOidcCfgDTO =
  | ({
      type: "external";
      organizationId: string;
    } & TGenericPermission)
  | {
      type: "internal";
      organizationId: string;
    };

export type TCreateOidcCfgDTO = {
  issuer?: string;
  authorizationEndpoint?: string;
  discoveryURL?: string;
  configurationType: OIDCConfigurationType;
  allowedEmailDomains?: string;
  jwksUri?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  organizationId: string;
  manageGroupMemberships: boolean;
  jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm;
  groupMembershipReconciliationEnabled?: boolean;
  groupMembershipReconciliationIntervalMinutes?: number;
} & TGenericPermission;

export type TUpdateOidcCfgDTO = Partial<{
  issuer: string;
  authorizationEndpoint: string;
  allowedEmailDomains: string;
  discoveryURL: string;
  jwksUri: string;
  configurationType: OIDCConfigurationType;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  clientId: string;
  clientSecret: string;
  isActive: boolean;
  organizationId: string;
  manageGroupMemberships: boolean;
  jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm;
  groupMembershipReconciliationEnabled: boolean;
  groupMembershipReconciliationIntervalMinutes: number;
}> &
  TGenericPermission;
