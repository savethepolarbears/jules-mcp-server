/**
 * Type declarations for @activepieces/pieces-framework.
 *
 * This piece is designed to be built within the Activepieces monorepo.
 * When developing standalone, these stubs provide type safety.
 * They are replaced by the real types when synced into Activepieces.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "@activepieces/pieces-framework" {
  // --- Property types ---

  interface PropertyOptions {
    displayName: string;
    description?: string;
    required: boolean;
    defaultValue?: any;
    options?: { options: Array<{ label: string; value: string }> };
  }

  interface PropertyFactory {
    ShortText(opts: PropertyOptions): any;
    LongText(opts: PropertyOptions): any;
    Number(opts: PropertyOptions): any;
    Checkbox(opts: PropertyOptions): any;
    StaticMultiSelectDropdown(opts: PropertyOptions): any;
    StaticDropdown(opts: PropertyOptions): any;
  }

  export const Property: PropertyFactory;

  // --- Auth types ---

  interface SecretTextOptions {
    displayName: string;
    description?: string;
    required: boolean;
  }

  interface CustomAuthOptions {
    description: string;
    required: boolean;
    props: Record<string, any>;
  }

  export const PieceAuth: {
    SecretText(opts: SecretTextOptions): any;
    CustomAuth(opts: CustomAuthOptions): any;
    None(): any;
  };

  // --- Trigger strategy ---

  export enum TriggerStrategy {
    POLLING = "POLLING",
    WEBHOOK = "WEBHOOK",
    APP_WEBHOOK = "APP_WEBHOOK",
  }

  // --- Create functions ---

  interface ActionDefinition {
    auth: any;
    name: string;
    displayName: string;
    description: string;
    props: Record<string, any>;
    run(context: {
      auth: any;
      propsValue: any;
      store: {
        get<T>(key: string): Promise<T | null>;
        put(key: string, value: any): Promise<void>;
      };
    }): Promise<any>;
  }

  interface TriggerDefinition {
    auth: any;
    name: string;
    displayName: string;
    description: string;
    type: TriggerStrategy;
    props: Record<string, any>;
    sampleData?: any;
    onEnable(context: any): Promise<void>;
    onDisable(context: any): Promise<void>;
    run(context: any): Promise<any[]>;
    test(context: any): Promise<any[]>;
  }

  interface PieceDefinition {
    displayName: string;
    description: string;
    auth: any;
    minimumSupportedRelease?: string;
    logoUrl?: string;
    actions: any[];
    triggers: any[];
    authors?: string[];
  }

  export function createAction(def: ActionDefinition): any;
  export function createTrigger(def: TriggerDefinition): any;
  export function createPiece(def: PieceDefinition): any;
}
