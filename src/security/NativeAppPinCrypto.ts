import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Platform primitives the JavaScript runtime cannot supply: Hermes ships no
 * WebCrypto and no CSPRNG. Both sides exchange binary as base64 because a
 * codegen spec has no binary type.
 *
 * Key derivation, verification and record encoding deliberately stay in
 * TypeScript, so this surface is only what must cross the boundary.
 */
export interface Spec extends TurboModule {
  randomBytesBase64(byteCount: number): Promise<string>;
  pbkdf2Sha256Base64(
    password: string,
    saltBase64: string,
    iterations: number,
    keyLengthBits: number,
  ): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppPinCrypto');
