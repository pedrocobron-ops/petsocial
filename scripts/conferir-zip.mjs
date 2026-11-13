// Confere o zip de src/lib/gestao/zip.ts: monta um arquivo de exemplo e pede para o `unzip -t` e o zipfile do Python lerem.
// Uso: node --experimental-strip-types scripts/conferir-zip.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, montarZip } from "../src/lib/gestao/zip.ts";

const igual = (a, b, o) => { if (a !== b) throw new Error(`${o}: esperava ${b}, veio ${a}`); };
igual(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "crc32");

const arquivos = [
  { nome: "LEIA-ME.txt", conteudo: "Cópia de segurança.\r\n" },
  { nome: "cuidados-de-saúde.csv", conteudo: "﻿\"Pet\";\"Vacina\"\r\n\"Tobias\";\"V10\"\r\n" },
  { nome: "vazio.csv", conteudo: "" },
  { nome: "bytes.bin", conteudo: Uint8Array.from({ length: 70000 }, (_, i) => i % 251) },
];
const pasta = mkdtempSync(join(tmpdir(), "zip-"));
const caminho = join(pasta, "teste.zip");
try {
  writeFileSync(caminho, montarZip(arquivos, new Date(2026, 10, 13, 9, 30, 0)));
  const rodar = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8" }); } catch (e) { if (e.code === "ENOENT") return null; throw e; } };
  const u = rodar("unzip", ["-t", caminho]);
  console.log(u === null ? "unzip não instalado: pulei" : u.trim().split("\n").pop());
  const py = rodar("python3", ["-I", "-c", `
import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({i.filename: [i.file_size, i.compress_type, i.flag_bits, list(i.date_time)] for i in z.infolist()}, ensure_ascii=False))
print(json.dumps(z.read("cuidados-de-saúde.csv").decode("utf-8")))
`, caminho]);
  if (py === null) console.log("python3 não instalado: pulei");
  else {
    const [lista, texto] = py.trim().split("\n").map((l) => JSON.parse(l));
    igual(Object.keys(lista).join("|"), arquivos.map((a) => a.nome).join("|"), "nomes");
    igual(lista["bytes.bin"][0], 70000, "tamanho");
    igual(lista["cuidados-de-saúde.csv"][2], 0x0800, "flags");
    igual(lista["LEIA-ME.txt"][3].join("-"), "2026-11-13-9-30-0", "data");
    igual(texto, arquivos[1].conteudo, "conteúdo");
    console.log("python zipfile: tudo certo");
  }
  if (u === null && py === null) process.exitCode = 1;
} finally { rmSync(pasta, { recursive: true, force: true }); }
