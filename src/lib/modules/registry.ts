import type { DfcModule } from "./types";
import { breachModule } from "./breach";
import { usernameFootprintModule } from "./usernameFootprint";
import { codeLeakModule } from "./codeLeak";
import { dataBrokerModule } from "./dataBroker";
import { domainExposureModule } from "./domainExposure";

/** Every identifier-driven module, in one place — add a new one here to make it pluggable. */
export const MODULES: DfcModule[] = [breachModule, usernameFootprintModule, codeLeakModule, dataBrokerModule, domainExposureModule];

export function getModule(id: string): DfcModule | undefined {
  return MODULES.find((m) => m.id === id);
}
