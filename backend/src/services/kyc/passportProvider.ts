import { KycVerificationResult } from "./kycProvider";

export class PassportProvider {
  async verify(passport: string): Promise<KycVerificationResult> {
    // Identity verification service not configured yet
    return {
      verified: false,
      status: "PROVIDER_NOT_CONFIGURED",
      message: "Identity verification service is not configured yet."
    };
  }
}
