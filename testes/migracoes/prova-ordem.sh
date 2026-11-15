#!/bin/bash
# Prova de ordem das migrações: num banco de rascunho (no mesmo Postgres local, apagado no fim), aplica todas as migrações
# de supabase/migrations em ordem, MENOS as "adiadas" (as que em produção entram só depois de publicar o aplicativo),
# e depois aplica as adiadas por cima. Cada arquivo roda numa transação; o primeiro que falhar para a prova.
#
# O "chão" do rascunho (auth, storage, extensões do Supabase) é copiado do banco local com pg_dump, sem o schema public.
#
# Variáveis (opcionais):
#   DB_CONTAINER  contêiner do Postgres (padrão supabase_db_petsocial)
#   MIGRACOES     pasta das migrações (padrão: supabase/migrations deste repositório)
#   ADIAR         prefixos das migrações adiadas, separados por espaço (padrão "20261149 20261157"; vazio = tudo em ordem)
#   RASCUNHO      nome do banco de rascunho (padrão prova_ordem_<pid>)
#   LOG           arquivo do log do chão (padrão: um arquivo temporário)
set -u
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
C="${DB_CONTAINER:-supabase_db_petsocial}"
M="${MIGRACOES:-$DIR/supabase/migrations}"
ADIAR="${ADIAR-20261149 20261157}"
DB="${RASCUNHO:-prova_ordem_$$}"
LOG="${LOG:-$(mktemp -t prova-ordem.XXXXXX)}"
D="docker exec -i $C"
t0=$(date +%s)

apagar() { $D psql -U supabase_admin -d postgres -q -c "drop database if exists $DB with (force)" >/dev/null 2>&1; }
trap apagar EXIT
falhou() { echo "FALHOU $1"; echo "$2" | tail -8; echo "##RESULTADO {\"suite\":\"migracoes\",\"passou\":$n,\"falhou\":1,\"conhecidos\":[],\"segundos\":$(( $(date +%s) - t0 )),\"falhas\":[\"$1\"]}"; exit 1; }
n=0

[ -d "$M" ] || { echo "pasta de migrações não existe: $M"; exit 1; }
apagar
$D psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -c "create database $DB template template0 owner postgres" || { echo "não consegui criar o rascunho"; exit 1; }
# chão: tudo do banco local menos o que as migrações criam (public) e o controle de migrações
$D pg_dump -U supabase_admin -d postgres --schema-only --exclude-schema=public --exclude-schema=supabase_migrations 2>>"$LOG" \
  | grep -v '^\\restrict\|^\\unrestrict' \
  | $D psql -U supabase_admin -d "$DB" -q >>"$LOG" 2>&1
# políticas do storage e do auth que vieram no chão citam funções do public (as migrações criam de novo)
$D psql -U supabase_admin -d "$DB" -q -v ON_ERROR_STOP=1 >>"$LOG" 2>&1 <<'SQL' || { echo "não consegui preparar o chão (veja $LOG)"; exit 1; }
do $$ declare r record; begin
  for r in select policyname, schemaname, tablename from pg_policies where schemaname in ('storage', 'auth') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
create schema if not exists public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
SQL

aplica() {
  local out
  out=$($D psql -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 --single-transaction < "$1" 2>&1) || falhou "$(basename "$1")" "$out"
  n=$((n + 1))
}
adiada() { local b; b=$(basename "$1"); for p in $ADIAR; do case "$b" in "$p"*) return 0;; esac; done; return 1; }

total=0; depois=()
for f in $(ls "$M"/*.sql | sort); do
  total=$((total + 1))
  if adiada "$f"; then depois+=("$f"); continue; fi
  aplica "$f"
done
echo "ok: $n migrações em ordem${ADIAR:+ (sem as adiadas: $ADIAR)}"
for f in "${depois[@]+"${depois[@]}"}"; do aplica "$f"; echo "ok: $(basename "$f") por cima"; done
[ "$n" -eq "$total" ] || falhou "contagem" "aplicadas $n de $total"
echo "##RESULTADO {\"suite\":\"migracoes\",\"passou\":$n,\"falhou\":0,\"conhecidos\":[],\"segundos\":$(( $(date +%s) - t0 )),\"falhas\":[]}"
