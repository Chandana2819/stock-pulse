export interface KycVerificationResult {
  verified: boolean;
  status: "SUCCESS" | "PROVIDER_NOT_CONFIGURED" | "VERIFICATION_FAILED";
  message?: string;
  name?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  documentNumber?: string;
}

export interface KycProvider {
  verifyPan(pan: string): Promise<KycVerificationResult>;
  verifyAadhaar(aadhaar: string): Promise<KycVerificationResult>;
  verifyPassport(passport: string): Promise<KycVerificationResult>;
}
