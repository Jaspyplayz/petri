import type { Database } from "./database.types";

type PublicSchema = Database["public"];

export type Tables<Name extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][Name]["Row"];
export type Enums<Name extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][Name];
