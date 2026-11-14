import { COLS_ESTADIA } from "@/lib/gestao/reservado";
import type { Cliente, Estadia, Pet } from "@/lib/gestao/tipos";

/** A estadia como as telas de creche e hotel leem: com o pet e o tutor. */
export type PetDaEstadia = Pick<Pet, "id" | "nome" | "foto" | "especie" | "sexo" | "alertas"> & { porte?: string | null; clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null };
export type EstadiaCompleta = Estadia & { pets: PetDaEstadia | null };
/** Sem a diária e o valor cobrado: quem recebe junta os dois com `comValoresDeEstadia` (reservado.ts). */
export const SELECT_ESTADIA = `${COLS_ESTADIA}, pets(id, nome, foto, especie, sexo, alertas, porte, clientes(id, nome, telefone))`;
export type Tipo = "creche" | "hotel";
export const nomeTipo = (t: string) => (t === "hotel" ? "Hotel" : "Creche");
/** "8h" ou "8h30" */
export const horaCurta = (d: string | Date) => { const x = new Date(d); return x.getMinutes() ? `${x.getHours()}h${String(x.getMinutes()).padStart(2, "0")}` : `${x.getHours()}h`; };
/** "ontem, 8h" */
export const quandoCurto = (d: string | Date, amigavel: (d: Date) => string) => `${amigavel(new Date(d))}, ${horaCurta(d)}`;
