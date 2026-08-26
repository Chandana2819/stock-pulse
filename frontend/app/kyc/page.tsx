"use client";

import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../lib/api";
import { useRouter } from "next/navigation";

type KycRecord = {
  id: string;
  fullName: string;
  panNumber: string;
  documentType: string;
  address: string;
  birthDate: string;
  amlStatus: string;
  amlMatchScore: number;
  verifiedAt: string | null;
  rejectedReason: string | null;
};

export default function KycPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<"NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED">("NOT_STARTED");
  const [kycRecord, setKycRecord] = useState<KycRecord | null>(null);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // Form inputs
  const [fullName, setFullName] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [documentType, setDocumentType] = useState("PAN");
  const [address, setAddress] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dummyFileUploaded, setDummyFileUploaded] = useState(false);

  useEffect(() => {
    fetchKycStatus();
  }, []);

  const fetchKycStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ kycStatus: typeof kycStatus; kycRecord: KycRecord | null }>("/api/kyc/status");
      setKycStatus(res.kycStatus);
      if (res.kycRecord) {
        setKycRecord(res.kycRecord);
        setFullName(res.kycRecord.fullName);
        setPanNumber(res.kycRecord.panNumber);
        setDocumentType(res.kycRecord.documentType);
        setAddress(res.kycRecord.address);
        setBirthDate(res.kycRecord.birthDate);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch KYC status");
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!fullName.trim() || !panNumber.trim() || !address.trim() || !birthDate) {
        setError("Please fill in all personal details.");
        return;
      }
      if (panNumber.trim().length !== 10) {
        setError("PAN must be exactly 10 characters.");
        return;
      }
      setError(null);
      setStep(2);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setDummyFileUploaded(true);
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dummyFileUploaded && !selectedFile) {
      setError("Please upload an identity document image or PDF.");
      return;
    }

    try {
      setError(null);
      setSubmitting(true);
      setStep(3); // Show AML screening radar screen

      // Simulate a small delay for AML watchlist screening
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const res = await api.post<{ kycStatus: typeof kycStatus; kycRecord: KycRecord }>("/api/kyc/verify", {
        fullName: fullName.trim(),
        panNumber: panNumber.trim().toUpperCase(),
        documentType,
        address: address.trim(),
        birthDate,
      });

      setKycStatus(res.kycStatus);
      setKycRecord(res.kycRecord);

      if (res.kycStatus === "REJECTED") {
        setError(res.kycRecord.rejectedReason || "KYC Rejection due to compliance failure.");
      }
    } catch (err: any) {
      setError(err.message || "KYC submission failed");
      setStep(2); // Go back to let them modify/try again
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setKycStatus("NOT_STARTED");
    setKycRecord(null);
    setFullName("");
    setPanNumber("");
    setDocumentType("PAN");
    setAddress("");
    setBirthDate("");
    setSelectedFile(null);
    setDummyFileUploaded(false);
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center font-mono text-xs text-text-3 gap-3">
        <div className="w-5 h-5 border border-t-transparent border-green-custom rounded-full animate-spin" />
        LOADING SECURE KYC COMPLIANCE PANEL...
      </div>
    );
  }

  // Render verified state immediately
  if (kycStatus === "VERIFIED" && kycRecord) {
    return (
      <div className="max-w-[700px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6 animate-card-enter">
        <div className="border border-green-custom bg-green-dim p-8 rounded shadow-glow-buy flex flex-col gap-5 relative">
          <div className="absolute top-4 right-4 font-mono text-[0.6rem] px-2 py-0.5 border border-green-custom text-green-custom uppercase tracking-widest bg-bg-1">
            Compliant
          </div>
          <div className="flex items-center gap-4">
            <span className="text-4xl">🛡️</span>
            <div>
              <h1 className="font-display text-2xl tracking-[0.15em] text-green-custom leading-none uppercase">KYC VERIFIED</h1>
              <p className="font-mono text-[0.65rem] text-text-2 mt-1">Identity matching and anti-money laundering checks passed successfully.</p>
            </div>
          </div>
          <hr className="border-green-custom/20" />
          <div className="grid grid-cols-2 gap-4 font-mono text-[0.68rem] leading-relaxed">
            <div>
              <span className="text-text-3 block uppercase tracking-wider text-[0.55rem]">Investor Name</span>
              <span className="text-text-custom font-bold">{kycRecord.fullName}</span>
            </div>
            <div>
              <span className="text-text-3 block uppercase tracking-wider text-[0.55rem]">PAN Number</span>
              <span className="text-text-custom font-bold">{kycRecord.panNumber}</span>
            </div>
            <div>
              <span className="text-text-3 block uppercase tracking-wider text-[0.55rem]">AML Screening</span>
              <span className="text-green-custom font-bold">PASSED (0.0% Risk Match)</span>
            </div>
            <div>
              <span className="text-text-3 block uppercase tracking-wider text-[0.55rem]">Verification Date</span>
              <span className="text-text-custom font-bold">{kycRecord.verifiedAt ? new Date(kycRecord.verifiedAt).toLocaleDateString("en-IN") : "--"}</span>
            </div>
          </div>
          <div className="mt-2">
            <button
              onClick={() => router.push("/portfolio")}
              className="w-full py-2.5 font-mono text-xs font-bold border border-green-custom bg-green-custom text-bg hover:bg-green-custom/80 transition-colors uppercase cursor-pointer"
            >
              Go to Portfolio
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render screening loading state
  if (step === 3 && submitting) {
    return (
      <div className="max-w-[700px] mx-auto w-full p-4 sm:p-8 flex flex-col items-center justify-center gap-8 min-h-[400px]">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 border border-green-custom/20 rounded-full animate-ping" />
          <div className="absolute inset-2 border border-green-custom/40 rounded-full animate-pulse" />
          <div className="w-10 h-10 border border-t-transparent border-green-custom rounded-full animate-spin" />
        </div>
        <div className="text-center flex flex-col gap-2">
          <h2 className="font-display text-xl tracking-[0.1em] text-text-custom uppercase animate-pulse">AML COMPLIANCE SCREENING IN PROGRESS</h2>
          <p className="font-mono text-[0.62rem] text-text-3 max-w-[400px] mx-auto leading-relaxed">
            Scanning anti-money laundering watchlists, global financial exclusion indexes (OFAC, FinCEN), and politically exposed person (PEP) catalogs...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[700px] mx-auto w-full p-4 sm:p-8 flex flex-col gap-6 animate-card-enter">
      <div>
        <h1 className="font-display text-2xl tracking-[0.1em] text-text-custom uppercase">KYC COMPLIANCE PORTAL</h1>
        <p className="font-mono text-[0.65rem] text-text-3 mt-1">Complete document verification and anti-money laundering check to activate live trading.</p>
      </div>

      {error && (
        <div className="border border-red-custom/40 bg-red-dim p-4 font-mono text-xs text-red-custom leading-relaxed uppercase">
          {error}
        </div>
      )}

      {/* Step Indicators */}
      <div className="grid grid-cols-3 gap-2 border-b border-border-custom pb-4">
        {[
          { num: 1, label: "Personal Info" },
          { num: 2, label: "Upload Docs" },
          { num: 3, label: "AML Screening" },
        ].map((s) => (
          <div
            key={s.num}
            className={`font-mono text-[0.6rem] tracking-wider uppercase pb-1 flex flex-col sm:flex-row items-start sm:items-center gap-1 border-b-2 transition-all ${
              step === s.num
                ? "border-green-custom text-green-custom font-bold"
                : step > s.num
                ? "border-border-bright text-text-2"
                : "border-transparent text-text-4"
            }`}
          >
            <span className="px-1.5 py-0.5 border border-current text-[0.5rem] leading-none rounded-full">{s.num}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* STEP 1: FORM */}
      {step === 1 && (
        <div className="border border-border-custom bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-mono text-xs font-bold text-text-2 uppercase">// Step 1: Investor Details</h2>
          <div className="flex flex-col gap-3 font-mono text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-text-3 uppercase tracking-wider text-[0.55rem]">Full Legal Name (Matching PAN)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. AMIT KUMAR SHARMA"
                className="bg-bg border border-border-bright text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4 uppercase"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-text-3 uppercase tracking-wider text-[0.55rem]">PAN (10-Digit Alphanumeric)</label>
              <input
                type="text"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                className="bg-bg border border-border-bright text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4 uppercase"
              />
              <span className="text-[0.58rem] text-text-4 lowercase mt-0.5">Tip: use names containing 'mallya' or 'choksi' to verify AML rejection flow.</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-text-3 uppercase tracking-wider text-[0.55rem]">Identity Document Type</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="bg-bg border border-border-bright text-text-custom p-2 focus:border-green-custom focus:outline-none"
                >
                  <option value="PAN">PAN Card</option>
                  <option value="AADHAAR">Aadhaar Card</option>
                  <option value="PASSPORT">Passport</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-text-3 uppercase tracking-wider text-[0.55rem]">Date of Birth</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="bg-bg border border-border-bright text-text-custom p-2 focus:border-green-custom focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-text-3 uppercase tracking-wider text-[0.55rem]">Residential Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full residential address details..."
                rows={3}
                className="bg-bg border border-border-bright text-text-custom p-2 focus:border-green-custom focus:outline-none placeholder:text-text-4"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleNextStep}
              className="px-6 py-2 border border-green-custom text-green-custom hover:bg-green-custom hover:text-bg transition-colors font-mono text-xs font-bold cursor-pointer"
            >
              Continue to Document Upload &gt;
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DOCUMENT UPLOAD */}
      {step === 2 && (
        <div className="border border-border-custom bg-bg-1 p-6 flex flex-col gap-4">
          <h2 className="font-mono text-xs font-bold text-text-2 uppercase">// Step 2: Upload Proof of Identity ({documentType})</h2>
          <div className="flex flex-col gap-4 font-mono text-xs">
            <div className="border-2 border-dashed border-border-bright hover:border-green-custom bg-bg p-8 rounded flex flex-col items-center justify-center gap-3 relative cursor-pointer group">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="text-3xl text-text-3 group-hover:scale-110 transition-transform">📂</span>
              <div className="text-center">
                <p className="text-text-2 font-bold uppercase">Drag &amp; drop document here</p>
                <p className="text-[0.62rem] text-text-3 mt-1">Accepts PNG, JPG, or PDF (Max 5MB)</p>
              </div>
            </div>

            {dummyFileUploaded && (
              <div className="border border-green-custom/30 bg-green-dim/20 p-3 rounded flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-custom text-sm">✓</span>
                  <div>
                    <p className="font-bold text-text-custom text-[0.65rem]">{selectedFile?.name || `${documentType.toLowerCase()}_proof.pdf`}</p>
                    <p className="text-[0.55rem] text-text-3">Uploaded successfully (simulated)</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDummyFileUploaded(false)}
                  className="text-red-custom hover:underline text-[0.62rem]"
                >
                  REMOVE
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-border-bright text-text-2 hover:bg-bg-3 transition-colors font-mono text-xs"
            >
              &lt; Back
            </button>
            <button
              onClick={handleSubmitKyc}
              disabled={submitting}
              className="px-6 py-2 border border-green-custom bg-green-custom text-bg hover:bg-green-custom/80 font-mono text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Upload &amp; Run Screening &gt;
            </button>
          </div>
        </div>
      )}

      {/* REJECTED STATE DISPLAY (IF COMPLETED CHECK FAILED) */}
      {kycStatus === "REJECTED" && (
        <div className="border border-red-custom bg-red-dim p-6 rounded shadow-red-glow flex flex-col gap-4 animate-card-enter">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h2 className="font-display text-xl tracking-[0.1em] text-red-custom leading-none uppercase">COMPLIANCE REVIEW REJECTED</h2>
              <p className="font-mono text-[0.65rem] text-text-2 mt-1">Verification failed compliance standards. Details below.</p>
            </div>
          </div>
          <hr className="border-red-custom/20" />
          <div className="font-mono text-xs leading-relaxed flex flex-col gap-2">
            <div>
              <span className="text-text-3 block uppercase tracking-wider text-[0.55rem]">Failure Reason</span>
              <span className="text-red-custom font-bold">{kycRecord?.rejectedReason || "Matched entry in AML High-Risk Watchlist."}</span>
            </div>
            <div>
              <span className="text-text-3 block uppercase tracking-wider text-[0.55rem]">Compliance Match Score</span>
              <span className="text-text-custom font-bold">{kycRecord?.amlMatchScore || 98.6}% MATCH</span>
            </div>
          </div>
          <div className="mt-2">
            <button
              onClick={handleReset}
              className="w-full py-2 border border-red-custom hover:bg-red-custom hover:text-bg transition-colors font-mono text-xs font-bold cursor-pointer uppercase"
            >
              Reset &amp; Retry Verification
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
