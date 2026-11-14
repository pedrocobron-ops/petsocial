
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admins": {
                  Row: {
                    "criado_em": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"user_id": string
                  }
                  Update: {
                    "criado_em"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"agendamento_servicos": {
                  Row: {
                    "agendamento_id": string,"criado_em": string,"id": string,"ordem": number,"petshop_id": string,"preco": number | null,"servico_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id": string,"criado_em"?: string,"id"?: string,"ordem"?: number,"petshop_id": string,"preco"?: number | null,"servico_id": string
                  }
                  Update: {
                    "agendamento_id"?: string,"criado_em"?: string,"id"?: string,"ordem"?: number,"petshop_id"?: string,"preco"?: number | null,"servico_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agendamento_servicos_agendamento_id_petshop_id_fkey"
      columns: ["agendamento_id","petshop_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "agendamento_servicos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agendamento_servicos_servico_id_petshop_id_fkey"
      columns: ["servico_id","petshop_id"]
isOneToOne: false
      referencedRelation: "servicos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"agendamentos": {
                  Row: {
                    "checklist": NonNullable<Json>,"criado_em": string,"criado_por": string | null,"endereco_leva_traz": string | null,"fim": string,"foto_antes": string | null,"foto_depois": string | null,"id": string,"inicio": string,"lembrete_em": string | null,"leva_traz": boolean,"obs": string | null,"origem": string,"pacote_cliente_id": string | null,"pet_id": string,"petshop_id": string,"preco": number | null,"profissional_id": string | null,"pronto_avisado_em": string | null,"sem_cobranca": boolean,"serie_id": string | null,"servico_id": string | null,"status": Database["public"]['Enums']["status_agendamento"]
                  }
                  ComputedFields: never
                  Insert: {
                    "checklist"?: NonNullable<Json>,"criado_em"?: string,"criado_por"?: string | null,"endereco_leva_traz"?: string | null,"fim": string,"foto_antes"?: string | null,"foto_depois"?: string | null,"id"?: string,"inicio": string,"lembrete_em"?: string | null,"leva_traz"?: boolean,"obs"?: string | null,"origem"?: string,"pacote_cliente_id"?: string | null,"pet_id": string,"petshop_id": string,"preco"?: number | null,"profissional_id"?: string | null,"pronto_avisado_em"?: string | null,"sem_cobranca"?: boolean,"serie_id"?: string | null,"servico_id"?: string | null,"status"?: Database["public"]['Enums']["status_agendamento"]
                  }
                  Update: {
                    "checklist"?: NonNullable<Json>,"criado_em"?: string,"criado_por"?: string | null,"endereco_leva_traz"?: string | null,"fim"?: string,"foto_antes"?: string | null,"foto_depois"?: string | null,"id"?: string,"inicio"?: string,"lembrete_em"?: string | null,"leva_traz"?: boolean,"obs"?: string | null,"origem"?: string,"pacote_cliente_id"?: string | null,"pet_id"?: string,"petshop_id"?: string,"preco"?: number | null,"profissional_id"?: string | null,"pronto_avisado_em"?: string | null,"sem_cobranca"?: boolean,"serie_id"?: string | null,"servico_id"?: string | null,"status"?: Database["public"]['Enums']["status_agendamento"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "agendamentos_pacote_cliente_id_petshop_id_fkey"
      columns: ["pacote_cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pacotes_clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "agendamentos_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "agendamentos_profissional_id_petshop_id_fkey"
      columns: ["profissional_id","petshop_id"]
isOneToOne: false
      referencedRelation: "profissionais"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "agendamentos_servico_id_petshop_id_fkey"
      columns: ["servico_id","petshop_id"]
isOneToOne: false
      referencedRelation: "servicos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"alteracoes_vistas": {
                  Row: {
                    "petshop_id": string,"user_id": string,"visto_em": string
                  }
                  ComputedFields: never
                  Insert: {
                    "petshop_id": string,"user_id": string,"visto_em"?: string
                  }
                  Update: {
                    "petshop_id"?: string,"user_id"?: string,"visto_em"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alteracoes_vistas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"assistente_eventos": {
                  Row: {
                    "acao": string | null,"criado_em": string,"detalhes": Json | null,"id": string,"pedido": string | null,"petshop_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao"?: string | null,"criado_em"?: string,"detalhes"?: Json | null,"id"?: string,"pedido"?: string | null,"petshop_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "acao"?: string | null,"criado_em"?: string,"detalhes"?: Json | null,"id"?: string,"pedido"?: string | null,"petshop_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistente_eventos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"bloqueios": {
                  Row: {
                    "criado_em": string,"criado_por": string | null,"fim": string,"id": string,"inicio": string,"motivo": string | null,"petshop_id": string,"profissional_id": string | null,"serie_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_por"?: string | null,"fim": string,"id"?: string,"inicio": string,"motivo"?: string | null,"petshop_id": string,"profissional_id"?: string | null,"serie_id"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"criado_por"?: string | null,"fim"?: string,"id"?: string,"inicio"?: string,"motivo"?: string | null,"petshop_id"?: string,"profissional_id"?: string | null,"serie_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bloqueios_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bloqueios_profissional_id_petshop_id_fkey"
      columns: ["profissional_id","petshop_id"]
isOneToOne: false
      referencedRelation: "profissionais"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"caixas": {
                  Row: {
                    "aberto_em": string,"aberto_por": string | null,"fechado_em": string | null,"fechado_por": string | null,"id": string,"obs": string | null,"petshop_id": string,"valor_contado": number | null,"valor_esperado": number | null,"valor_inicial": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aberto_em"?: string,"aberto_por"?: string | null,"fechado_em"?: string | null,"fechado_por"?: string | null,"id"?: string,"obs"?: string | null,"petshop_id": string,"valor_contado"?: number | null,"valor_esperado"?: number | null,"valor_inicial"?: number
                  }
                  Update: {
                    "aberto_em"?: string,"aberto_por"?: string | null,"fechado_em"?: string | null,"fechado_por"?: string | null,"id"?: string,"obs"?: string | null,"petshop_id"?: string,"valor_contado"?: number | null,"valor_esperado"?: number | null,"valor_inicial"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "caixas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"cakto_eventos": {
                  Row: {
                    "email": string | null,"evento": string | null,"id": number,"payload": Json | null,"petshop_id": string | null,"recebido_em": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email"?: string | null,"evento"?: string | null,"id"?: never,"payload"?: Json | null,"petshop_id"?: string | null,"recebido_em"?: string
                  }
                  Update: {
                    "email"?: string | null,"evento"?: string | null,"id"?: never,"payload"?: Json | null,"petshop_id"?: string | null,"recebido_em"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cakto_eventos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"clientes": {
                  Row: {
                    "criado_em": string,"email": string | null,"endereco": string | null,"id": string,"nome": string,"obs": string | null,"petshop_id": string,"telefone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"email"?: string | null,"endereco"?: string | null,"id"?: string,"nome": string,"obs"?: string | null,"petshop_id": string,"telefone"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"email"?: string | null,"endereco"?: string | null,"id"?: string,"nome"?: string,"obs"?: string | null,"petshop_id"?: string,"telefone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clientes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"comissao_servicos": {
                  Row: {
                    "pct": number,"petshop_id": string,"servico_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "pct": number,"petshop_id": string,"servico_id": string
                  }
                  Update: {
                    "pct"?: number,"petshop_id"?: string,"servico_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comissao_servicos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissao_servicos_servico_id_petshop_id_fkey"
      columns: ["servico_id","petshop_id"]
isOneToOne: false
      referencedRelation: "servicos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"comissoes_pagas": {
                  Row: {
                    "ate": string,"de": string,"id": string,"lancamento_id": string,"pago_em": string,"pago_por": string | null,"petshop_id": string,"profissional_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ate": string,"de": string,"id"?: string,"lancamento_id": string,"pago_em"?: string,"pago_por"?: string | null,"petshop_id": string,"profissional_id": string,"valor": number
                  }
                  Update: {
                    "ate"?: string,"de"?: string,"id"?: string,"lancamento_id"?: string,"pago_em"?: string,"pago_por"?: string | null,"petshop_id"?: string,"profissional_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "comissoes_pagas_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_pagas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comissoes_pagas_profissional_id_petshop_id_fkey"
      columns: ["profissional_id","petshop_id"]
isOneToOne: false
      referencedRelation: "profissionais"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"config_interna": {
                  Row: {
                    "chave": string,"valor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"valor": string
                  }
                  Update: {
                    "chave"?: string,"valor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"conversas": {
                  Row: {
                    "canal": string,"criado_em": string,"id": string,"pediu_equipe": boolean,"pergunta": string,"petshop_id": string,"resolveu": boolean | null,"resposta": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "canal": string,"criado_em"?: string,"id"?: string,"pediu_equipe"?: boolean,"pergunta": string,"petshop_id": string,"resolveu"?: boolean | null,"resposta"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "canal"?: string,"criado_em"?: string,"id"?: string,"pediu_equipe"?: boolean,"pergunta"?: string,"petshop_id"?: string,"resolveu"?: boolean | null,"resposta"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"creche_atrasos": {
                  Row: {
                    "cobranca_id": string | null,"criado_em": string,"decidido_em": string | null,"decidido_por": string | null,"dia": string,"estadia_id": string,"estado": string,"lancamento_id": string | null,"limite": string,"pet_id": string,"petshop_id": string,"plano_id": string | null,"saiu_em": string,"valor": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cobranca_id"?: string | null,"criado_em"?: string,"decidido_em"?: string | null,"decidido_por"?: string | null,"dia": string,"estadia_id": string,"estado"?: string,"lancamento_id"?: string | null,"limite"?: string,"pet_id": string,"petshop_id": string,"plano_id"?: string | null,"saiu_em": string,"valor"?: number | null
                  }
                  Update: {
                    "cobranca_id"?: string | null,"criado_em"?: string,"decidido_em"?: string | null,"decidido_por"?: string | null,"dia"?: string,"estadia_id"?: string,"estado"?: string,"lancamento_id"?: string | null,"limite"?: string,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string | null,"saiu_em"?: string,"valor"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_atrasos_cobranca_id_fkey"
      columns: ["cobranca_id"]
isOneToOne: false
      referencedRelation: "creche_cobrancas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_atrasos_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: true
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_atrasos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_atrasos_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "creche_atrasos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_atrasos_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "creche_planos"
      referencedColumns: ["id"]
    }
                  ]
                },"creche_cobrancas": {
                  Row: {
                    "cliente_id": string | null,"cobrado_em": string | null,"criado_em": string,"criado_por": string | null,"desconto": number,"extras": NonNullable<Json>,"id": string,"lancamento_id": string | null,"mes": string,"obs": string | null,"pet_id": string,"petshop_id": string,"plano_id": string,"por_fora": boolean,"status": string,"taxas": NonNullable<Json>,"total": number,"valor_cheio": number,"valor_extras": number,"valor_mensal": number,"vencimento": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: string | null,"cobrado_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"desconto"?: number,"extras"?: NonNullable<Json>,"id"?: string,"lancamento_id"?: string | null,"mes": string,"obs"?: string | null,"pet_id": string,"petshop_id": string,"plano_id": string,"por_fora"?: boolean,"status"?: string,"taxas"?: NonNullable<Json>,"total": number,"valor_cheio": number,"valor_extras"?: number,"valor_mensal": number,"vencimento": string
                  }
                  Update: {
                    "cliente_id"?: string | null,"cobrado_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"desconto"?: number,"extras"?: NonNullable<Json>,"id"?: string,"lancamento_id"?: string | null,"mes"?: string,"obs"?: string | null,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string,"por_fora"?: boolean,"status"?: string,"taxas"?: NonNullable<Json>,"total"?: number,"valor_cheio"?: number,"valor_extras"?: number,"valor_mensal"?: number,"vencimento"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_cobrancas_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "creche_cobrancas_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_cobrancas_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "creche_cobrancas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_cobrancas_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "creche_planos"
      referencedColumns: ["id"]
    }
                  ]
                },"creche_faltas": {
                  Row: {
                    "avisou": boolean,"criado_em": string,"criado_por": string | null,"dia": string,"id": string,"pet_id": string,"petshop_id": string,"plano_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avisou"?: boolean,"criado_em"?: string,"criado_por"?: string | null,"dia": string,"id"?: string,"pet_id": string,"petshop_id": string,"plano_id": string
                  }
                  Update: {
                    "avisou"?: boolean,"criado_em"?: string,"criado_por"?: string | null,"dia"?: string,"id"?: string,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_faltas_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "creche_faltas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_faltas_plano_id_petshop_id_fkey"
      columns: ["plano_id","petshop_id"]
isOneToOne: false
      referencedRelation: "creche_planos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"creche_modelos": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"id": string,"nome": string,"petshop_id": string,"valor_extra": number | null,"valor_mensal": number,"vezes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome": string,"petshop_id": string,"valor_extra"?: number | null,"valor_mensal": number,"vezes"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome"?: string,"petshop_id"?: string,"valor_extra"?: number | null,"valor_mensal"?: number,"vezes"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_modelos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"creche_planos": {
                  Row: {
                    "criado_em": string,"criado_por": string | null,"dias": (number)[],"fim": string | null,"id": string,"inicio": string,"obs": string | null,"pausa_ate": string | null,"pausa_de": string | null,"pet_id": string,"petshop_id": string,"primeira_cobranca": string | null,"vence_dia": number
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_por"?: string | null,"dias": (number)[],"fim"?: string | null,"id"?: string,"inicio": string,"obs"?: string | null,"pausa_ate"?: string | null,"pausa_de"?: string | null,"pet_id": string,"petshop_id": string,"primeira_cobranca"?: string | null,"vence_dia"?: number
                  }
                  Update: {
                    "criado_em"?: string,"criado_por"?: string | null,"dias"?: (number)[],"fim"?: string | null,"id"?: string,"inicio"?: string,"obs"?: string | null,"pausa_ate"?: string | null,"pausa_de"?: string | null,"pet_id"?: string,"petshop_id"?: string,"primeira_cobranca"?: string | null,"vence_dia"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_planos_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "creche_planos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"creche_planos_valores": {
                  Row: {
                    "atualizado_em": string,"modelo_id": string | null,"petshop_id": string,"plano_id": string,"valor_extra": number | null,"valor_mensal": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"modelo_id"?: string | null,"petshop_id": string,"plano_id": string,"valor_extra"?: number | null,"valor_mensal": number
                  }
                  Update: {
                    "atualizado_em"?: string,"modelo_id"?: string | null,"petshop_id"?: string,"plano_id"?: string,"valor_extra"?: number | null,"valor_mensal"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_planos_valores_modelo_id_fkey"
      columns: ["modelo_id"]
isOneToOne: false
      referencedRelation: "creche_modelos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_planos_valores_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_planos_valores_plano_id_petshop_id_fkey"
      columns: ["plano_id","petshop_id"]
isOneToOne: false
      referencedRelation: "creche_planos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"creche_reposicoes": {
                  Row: {
                    "decidido_em": string | null,"decidido_por": string | null,"dia": string,"estadia_id": string,"estado": string,"marcado_em": string,"marcado_por": string | null,"pet_id": string,"petshop_id": string,"plano_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "decidido_em"?: string | null,"decidido_por"?: string | null,"dia": string,"estadia_id": string,"estado"?: string,"marcado_em"?: string,"marcado_por"?: string | null,"pet_id": string,"petshop_id": string,"plano_id"?: string | null
                  }
                  Update: {
                    "decidido_em"?: string | null,"decidido_por"?: string | null,"dia"?: string,"estadia_id"?: string,"estado"?: string,"marcado_em"?: string,"marcado_por"?: string | null,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "creche_reposicoes_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: true
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_reposicoes_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "creche_reposicoes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creche_reposicoes_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "creche_planos"
      referencedColumns: ["id"]
    }
                  ]
                },"dias_especiais": {
                  Row: {
                    "criado_em": string,"dia": string,"fechado": boolean,"feriado": boolean,"id": string,"nome": string,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"dia": string,"fechado"?: boolean,"feriado"?: boolean,"id"?: string,"nome"?: string,"petshop_id": string
                  }
                  Update: {
                    "criado_em"?: string,"dia"?: string,"fechado"?: boolean,"feriado"?: boolean,"id"?: string,"nome"?: string,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dias_especiais_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"escola_compras": {
                  Row: {
                    "criado_em": string,"email": string,"id": string,"origem": string,"pedido": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"email": string,"id"?: string,"origem"?: string,"pedido"?: string | null,"slug": string
                  }
                  Update: {
                    "criado_em"?: string,"email"?: string,"id"?: string,"origem"?: string,"pedido"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"escola_materiais": {
                  Row: {
                    "arquivo": string,"atualizado_em": string,"slug": string,"tamanho": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo": string,"atualizado_em"?: string,"slug": string,"tamanho"?: number | null
                  }
                  Update: {
                    "arquivo"?: string,"atualizado_em"?: string,"slug"?: string,"tamanho"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"estadias": {
                  Row: {
                    "acomodacao": string | null,"avisos": NonNullable<Json>,"cobranca_id": string | null,"criado_em": string,"cuidados": Json | null,"dia": string | null,"diarias_cobradas": number | null,"entrada": string,"id": string,"mensalista": string | null,"obs": string | null,"pet_id": string,"petshop_id": string,"plano_id": string | null,"saida": string | null,"saida_prevista": string | null,"sinal_estado": string | null,"status": string,"tipo": string,"valor_cobrado": number | null,"valor_diaria": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acomodacao"?: string | null,"avisos"?: NonNullable<Json>,"cobranca_id"?: string | null,"criado_em"?: string,"cuidados"?: Json | null,"dia"?: string | null,"diarias_cobradas"?: number | null,"entrada": string,"id"?: string,"mensalista"?: string | null,"obs"?: string | null,"pet_id": string,"petshop_id": string,"plano_id"?: string | null,"saida"?: string | null,"saida_prevista"?: string | null,"sinal_estado"?: string | null,"status"?: string,"tipo": string,"valor_cobrado"?: number | null,"valor_diaria"?: number | null
                  }
                  Update: {
                    "acomodacao"?: string | null,"avisos"?: NonNullable<Json>,"cobranca_id"?: string | null,"criado_em"?: string,"cuidados"?: Json | null,"dia"?: string | null,"diarias_cobradas"?: number | null,"entrada"?: string,"id"?: string,"mensalista"?: string | null,"obs"?: string | null,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string | null,"saida"?: string | null,"saida_prevista"?: string | null,"sinal_estado"?: string | null,"status"?: string,"tipo"?: string,"valor_cobrado"?: number | null,"valor_diaria"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_cobranca_id_fkey"
      columns: ["cobranca_id"]
isOneToOne: false
      referencedRelation: "creche_cobrancas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "estadias_plano_id_fkey"
      columns: ["plano_id"]
isOneToOne: false
      referencedRelation: "creche_planos"
      referencedColumns: ["id"]
    }
                  ]
                },"estadias_cuidados": {
                  Row: {
                    "dia": string,"estadia_id": string,"feito_em": string,"feito_nome": string | null,"feito_por": string | null,"hora": string,"id": string,"item": string,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dia": string,"estadia_id": string,"feito_em"?: string,"feito_nome"?: string | null,"feito_por"?: string | null,"hora"?: string,"id"?: string,"item": string,"petshop_id": string
                  }
                  Update: {
                    "dia"?: string,"estadia_id"?: string,"feito_em"?: string,"feito_nome"?: string | null,"feito_por"?: string | null,"hora"?: string,"id"?: string,"item"?: string,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_cuidados_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_cuidados_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"estadias_diario": {
                  Row: {
                    "atualizado_em": string,"atualizado_nome": string | null,"atualizado_por": string | null,"dia": string,"enviado_em": string | null,"estadia_id": string,"id": string,"itens": NonNullable<Json>,"nota": string | null,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"atualizado_nome"?: string | null,"atualizado_por"?: string | null,"dia": string,"enviado_em"?: string | null,"estadia_id": string,"id"?: string,"itens"?: NonNullable<Json>,"nota"?: string | null,"petshop_id": string
                  }
                  Update: {
                    "atualizado_em"?: string,"atualizado_nome"?: string | null,"atualizado_por"?: string | null,"dia"?: string,"enviado_em"?: string | null,"estadia_id"?: string,"id"?: string,"itens"?: NonNullable<Json>,"nota"?: string | null,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_diario_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_diario_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"estadias_ocorrencias": {
                  Row: {
                    "criado_em": string,"criado_nome": string | null,"criado_por": string | null,"estadia_id": string,"id": string,"no_diario": boolean,"pet_id": string,"petshop_id": string,"quando": string,"texto": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"estadia_id": string,"id"?: string,"no_diario"?: boolean,"pet_id": string,"petshop_id": string,"quando"?: string,"texto"?: string,"tipo": string
                  }
                  Update: {
                    "criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"estadia_id"?: string,"id"?: string,"no_diario"?: boolean,"pet_id"?: string,"petshop_id"?: string,"quando"?: string,"texto"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_ocorrencias_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_ocorrencias_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_ocorrencias_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"estadias_retiradas": {
                  Row: {
                    "anotado_em": string,"anotado_nome": string | null,"anotado_por": string | null,"contato_id": string | null,"estadia_id": string,"nome": string,"petshop_id": string,"quem": string,"relacao": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anotado_em"?: string,"anotado_nome"?: string | null,"anotado_por"?: string | null,"contato_id"?: string | null,"estadia_id": string,"nome": string,"petshop_id": string,"quem": string,"relacao"?: string | null
                  }
                  Update: {
                    "anotado_em"?: string,"anotado_nome"?: string | null,"anotado_por"?: string | null,"contato_id"?: string | null,"estadia_id"?: string,"nome"?: string,"petshop_id"?: string,"quem"?: string,"relacao"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_retiradas_contato_id_fkey"
      columns: ["contato_id"]
isOneToOne: false
      referencedRelation: "pets_contatos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_retiradas_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: true
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_retiradas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"estadias_valores": {
                  Row: {
                    "atualizado_em": string,"conta": Json | null,"estadia_id": string,"petshop_id": string,"sinal": number | null,"sinal_devolucao_id": string | null,"sinal_devolvido_em": string | null,"sinal_estado": string | null,"sinal_lancamento_id": string | null,"sinal_pagamento": Json | null,"sinal_pago_em": string | null,"sinal_recebido": number,"taxas": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"conta"?: Json | null,"estadia_id": string,"petshop_id": string,"sinal"?: number | null,"sinal_devolucao_id"?: string | null,"sinal_devolvido_em"?: string | null,"sinal_estado"?: string | null,"sinal_lancamento_id"?: string | null,"sinal_pagamento"?: Json | null,"sinal_pago_em"?: string | null,"sinal_recebido"?: number,"taxas"?: Json | null
                  }
                  Update: {
                    "atualizado_em"?: string,"conta"?: Json | null,"estadia_id"?: string,"petshop_id"?: string,"sinal"?: number | null,"sinal_devolucao_id"?: string | null,"sinal_devolvido_em"?: string | null,"sinal_estado"?: string | null,"sinal_lancamento_id"?: string | null,"sinal_pagamento"?: Json | null,"sinal_pago_em"?: string | null,"sinal_recebido"?: number,"taxas"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_valores_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: true
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_valores_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"fidelidade_resgates": {
                  Row: {
                    "atendimentos": number,"cliente_id": string,"criado_em": string,"criado_por": string | null,"id": string,"petshop_id": string,"premio": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atendimentos": number,"cliente_id": string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"petshop_id": string,"premio": string
                  }
                  Update: {
                    "atendimentos"?: number,"cliente_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"petshop_id"?: string,"premio"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fidelidade_resgates_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "fidelidade_resgates_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"fornecedores": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"id": string,"nome": string,"observacoes": string | null,"petshop_id": string,"telefone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome": string,"observacoes"?: string | null,"petshop_id": string,"telefone"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome"?: string,"observacoes"?: string | null,"petshop_id"?: string,"telefone"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fornecedores_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"hotel_precos": {
                  Row: {
                    "atraso": NonNullable<Json>,"atualizado_em": string,"feriado": NonNullable<Json>,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atraso"?: NonNullable<Json>,"atualizado_em"?: string,"feriado"?: NonNullable<Json>,"petshop_id": string
                  }
                  Update: {
                    "atraso"?: NonNullable<Json>,"atualizado_em"?: string,"feriado"?: NonNullable<Json>,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hotel_precos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: true
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"lancamentos": {
                  Row: {
                    "agendamento_id": string | null,"alterado_em": string | null,"caixa_id": string | null,"categoria": string,"chave": string | null,"cliente_id": string | null,"cobrado_em": string | null,"conta_id": string | null,"criado_em": string,"criado_por": string | null,"data": string,"descricao": string | null,"forma": string | null,"id": string,"itens": Json | null,"movimento": string | null,"multa_de": string | null,"multa_recebida": number | null,"multa_recebida_em": string | null,"origem": string,"pagamentos": Json | null,"pago": boolean,"petshop_id": string,"tipo": string,"valor": number,"valor_original": number | null,"vencimento": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"alterado_em"?: string | null,"caixa_id"?: string | null,"categoria"?: string,"chave"?: string | null,"cliente_id"?: string | null,"cobrado_em"?: string | null,"conta_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"data"?: string,"descricao"?: string | null,"forma"?: string | null,"id"?: string,"itens"?: Json | null,"movimento"?: string | null,"multa_de"?: string | null,"multa_recebida"?: number | null,"multa_recebida_em"?: string | null,"origem"?: string,"pagamentos"?: Json | null,"pago"?: boolean,"petshop_id": string,"tipo": string,"valor": number,"valor_original"?: number | null,"vencimento"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"alterado_em"?: string | null,"caixa_id"?: string | null,"categoria"?: string,"chave"?: string | null,"cliente_id"?: string | null,"cobrado_em"?: string | null,"conta_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"data"?: string,"descricao"?: string | null,"forma"?: string | null,"id"?: string,"itens"?: Json | null,"movimento"?: string | null,"multa_de"?: string | null,"multa_recebida"?: number | null,"multa_recebida_em"?: string | null,"origem"?: string,"pagamentos"?: Json | null,"pago"?: boolean,"petshop_id"?: string,"tipo"?: string,"valor"?: number,"valor_original"?: number | null,"vencimento"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamentos_agendamento_id_petshop_id_fkey"
      columns: ["agendamento_id","petshop_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "lancamentos_caixa_id_petshop_id_fkey"
      columns: ["caixa_id","petshop_id"]
isOneToOne: false
      referencedRelation: "caixas"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "lancamentos_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "lancamentos_conta_id_fkey"
      columns: ["conta_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_multa_de_fkey"
      columns: ["multa_de"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"lancamentos_alteracoes": {
                  Row: {
                    "acao": string,"antes": NonNullable<Json>,"depois": Json | null,"id": string,"lancamento_id": string,"petshop_id": string,"quando": string,"quem": string | null,"quem_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"antes": NonNullable<Json>,"depois"?: Json | null,"id"?: string,"lancamento_id": string,"petshop_id": string,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null
                  }
                  Update: {
                    "acao"?: string,"antes"?: NonNullable<Json>,"depois"?: Json | null,"id"?: string,"lancamento_id"?: string,"petshop_id"?: string,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamentos_alteracoes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"lista_espera": {
                  Row: {
                    "chamado_em": string | null,"criado_em": string,"criado_nome": string | null,"criado_por": string | null,"entrada": string,"especie": string | null,"id": string,"obs": string | null,"origem": string,"pet_id": string | null,"pet_nome": string,"petshop_id": string,"porte": string | null,"saida": string,"status": string,"telefone": string | null,"termos_aceitos_em": string | null,"tipo": string,"tutor_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chamado_em"?: string | null,"criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"entrada": string,"especie"?: string | null,"id"?: string,"obs"?: string | null,"origem"?: string,"pet_id"?: string | null,"pet_nome": string,"petshop_id": string,"porte"?: string | null,"saida": string,"status"?: string,"telefone"?: string | null,"termos_aceitos_em"?: string | null,"tipo": string,"tutor_nome"?: string | null
                  }
                  Update: {
                    "chamado_em"?: string | null,"criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"entrada"?: string,"especie"?: string | null,"id"?: string,"obs"?: string | null,"origem"?: string,"pet_id"?: string | null,"pet_nome"?: string,"petshop_id"?: string,"porte"?: string | null,"saida"?: string,"status"?: string,"telefone"?: string | null,"termos_aceitos_em"?: string | null,"tipo"?: string,"tutor_nome"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lista_espera_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lista_espera_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"modelos_mensagem": {
                  Row: {
                    "atualizado_em": string,"chave": string,"petshop_id": string,"texto": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"chave": string,"petshop_id": string,"texto": string
                  }
                  Update: {
                    "atualizado_em"?: string,"chave"?: string,"petshop_id"?: string,"texto"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modelos_mensagem_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"movimentos_estoque": {
                  Row: {
                    "chave": string | null,"criado_em": string,"criado_por": string | null,"custo_unitario": number | null,"fornecedor_id": string | null,"id": string,"lancamento_id": string | null,"motivo": string | null,"origem": string,"petshop_id": string,"produto_id": string,"quantidade": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"custo_unitario"?: number | null,"fornecedor_id"?: string | null,"id"?: string,"lancamento_id"?: string | null,"motivo"?: string | null,"origem"?: string,"petshop_id": string,"produto_id": string,"quantidade": number,"tipo": string
                  }
                  Update: {
                    "chave"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"custo_unitario"?: number | null,"fornecedor_id"?: string | null,"id"?: string,"lancamento_id"?: string | null,"motivo"?: string | null,"origem"?: string,"petshop_id"?: string,"produto_id"?: string,"quantidade"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimentos_estoque_fornecedor_fkey"
      columns: ["fornecedor_id","petshop_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "movimentos_estoque_produto_id_petshop_id_fkey"
      columns: ["produto_id","petshop_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"notas_admin": {
                  Row: {
                    "atualizado_em": string,"nota": string | null,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"nota"?: string | null,"petshop_id": string
                  }
                  Update: {
                    "atualizado_em"?: string,"nota"?: string | null,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notas_admin_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: true
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"operacoes_feitas": {
                  Row: {
                    "chave": string,"criado_em": string,"criado_por": string | null,"petshop_id": string,"resultado": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"criado_em"?: string,"criado_por"?: string | null,"petshop_id": string,"resultado": NonNullable<Json>
                  }
                  Update: {
                    "chave"?: string,"criado_em"?: string,"criado_por"?: string | null,"petshop_id"?: string,"resultado"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "operacoes_feitas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"pacotes": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"id": string,"nome": string,"petshop_id": string,"preco": number,"quantidade": number,"servico_id": string | null,"validade_dias": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome": string,"petshop_id": string,"preco"?: number,"quantidade"?: number,"servico_id"?: string | null,"validade_dias"?: number
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome"?: string,"petshop_id"?: string,"preco"?: number,"quantidade"?: number,"servico_id"?: string | null,"validade_dias"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pacotes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pacotes_servico_id_petshop_id_fkey"
      columns: ["servico_id","petshop_id"]
isOneToOne: false
      referencedRelation: "servicos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"pacotes_clientes": {
                  Row: {
                    "ativo": boolean,"chave": string | null,"comprado_em": string,"criado_em": string,"id": string,"nome": string,"pacote_id": string | null,"pet_id": string,"petshop_id": string,"preco": number,"servico_id": string | null,"total": number,"usados": number,"vence_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"chave"?: string | null,"comprado_em"?: string,"criado_em"?: string,"id"?: string,"nome": string,"pacote_id"?: string | null,"pet_id": string,"petshop_id": string,"preco"?: number,"servico_id"?: string | null,"total": number,"usados"?: number,"vence_em"?: string | null
                  }
                  Update: {
                    "ativo"?: boolean,"chave"?: string | null,"comprado_em"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"pacote_id"?: string | null,"pet_id"?: string,"petshop_id"?: string,"preco"?: number,"servico_id"?: string | null,"total"?: number,"usados"?: number,"vence_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pacotes_clientes_pacote_id_petshop_id_fkey"
      columns: ["pacote_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pacotes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "pacotes_clientes_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "pacotes_clientes_servico_id_petshop_id_fkey"
      columns: ["servico_id","petshop_id"]
isOneToOne: false
      referencedRelation: "servicos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"pedidos_agendamento": {
                  Row: {
                    "agendamento_id": string | null,"avisado_em": string | null,"cliente_cancelou_em": string | null,"cliente_pedido_visto_em": string | null,"cliente_pediu": string | null,"cliente_pediu_em": string | null,"cliente_recado": string | null,"criado_em": string,"especie": string,"estadia_id": string | null,"fim": string,"grupo_id": string | null,"id": string,"inicio": string,"obs": string | null,"pet_nome": string,"petshop_id": string,"porte": string | null,"servico_id": string | null,"status": string,"telefone": string,"termos_aceitos_em": string | null,"termos_texto": string | null,"termos_vacinas": boolean | null,"tipo": string,"tutor_nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"avisado_em"?: string | null,"cliente_cancelou_em"?: string | null,"cliente_pedido_visto_em"?: string | null,"cliente_pediu"?: string | null,"cliente_pediu_em"?: string | null,"cliente_recado"?: string | null,"criado_em"?: string,"especie"?: string,"estadia_id"?: string | null,"fim": string,"grupo_id"?: string | null,"id"?: string,"inicio": string,"obs"?: string | null,"pet_nome": string,"petshop_id": string,"porte"?: string | null,"servico_id"?: string | null,"status"?: string,"telefone": string,"termos_aceitos_em"?: string | null,"termos_texto"?: string | null,"termos_vacinas"?: boolean | null,"tipo"?: string,"tutor_nome": string
                  }
                  Update: {
                    "agendamento_id"?: string | null,"avisado_em"?: string | null,"cliente_cancelou_em"?: string | null,"cliente_pedido_visto_em"?: string | null,"cliente_pediu"?: string | null,"cliente_pediu_em"?: string | null,"cliente_recado"?: string | null,"criado_em"?: string,"especie"?: string,"estadia_id"?: string | null,"fim"?: string,"grupo_id"?: string | null,"id"?: string,"inicio"?: string,"obs"?: string | null,"pet_nome"?: string,"petshop_id"?: string,"porte"?: string | null,"servico_id"?: string | null,"status"?: string,"telefone"?: string,"termos_aceitos_em"?: string | null,"termos_texto"?: string | null,"termos_vacinas"?: boolean | null,"tipo"?: string,"tutor_nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedidos_agendamento_agendamento_id_petshop_id_fkey"
      columns: ["agendamento_id","petshop_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "pedidos_agendamento_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_agendamento_servico_id_petshop_id_fkey"
      columns: ["servico_id","petshop_id"]
isOneToOne: false
      referencedRelation: "servicos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"pets": {
                  Row: {
                    "alertas": string | null,"ativo": boolean,"cliente_id": string,"criado_em": string,"especie": string,"foto": string | null,"id": string,"nascimento": string | null,"nome": string,"obs": string | null,"petshop_id": string,"porte": string | null,"raca": string | null,"sexo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alertas"?: string | null,"ativo"?: boolean,"cliente_id": string,"criado_em"?: string,"especie"?: string,"foto"?: string | null,"id"?: string,"nascimento"?: string | null,"nome": string,"obs"?: string | null,"petshop_id": string,"porte"?: string | null,"raca"?: string | null,"sexo"?: string | null
                  }
                  Update: {
                    "alertas"?: string | null,"ativo"?: boolean,"cliente_id"?: string,"criado_em"?: string,"especie"?: string,"foto"?: string | null,"id"?: string,"nascimento"?: string | null,"nome"?: string,"obs"?: string | null,"petshop_id"?: string,"porte"?: string | null,"raca"?: string | null,"sexo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pets_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"pets_contatos": {
                  Row: {
                    "cliente_id": string | null,"criado_em": string,"criado_por": string | null,"id": string,"nome": string,"obs": string | null,"pet_id": string | null,"petshop_id": string,"relacao": string | null,"telefone": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"nome": string,"obs"?: string | null,"pet_id"?: string | null,"petshop_id": string,"relacao"?: string | null,"telefone"?: string | null,"tipo": string
                  }
                  Update: {
                    "cliente_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"nome"?: string,"obs"?: string | null,"pet_id"?: string | null,"petshop_id"?: string,"relacao"?: string | null,"telefone"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pets_contatos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pets_contatos_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pets_contatos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"pets_saude": {
                  Row: {
                    "aplicado_em": string | null,"criado_em": string,"criado_por": string | null,"id": string,"nome": string,"obs": string | null,"pet_id": string,"petshop_id": string,"tipo": string,"vence_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aplicado_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"nome": string,"obs"?: string | null,"pet_id": string,"petshop_id": string,"tipo"?: string,"vence_em"?: string | null
                  }
                  Update: {
                    "aplicado_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"nome"?: string,"obs"?: string | null,"pet_id"?: string,"petshop_id"?: string,"tipo"?: string,"vence_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pets_saude_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"petshops": {
                  Row: {
                    "assinatura_desde": string | null,"cakto_assinatura": string | null,"cakto_email": string | null,"cidade": string | null,"creche_bloqueia_vacina": boolean,"criado_em": string,"criado_por": string | null,"diaria_creche": number | null,"diaria_hotel": number | null,"fidelidade_cada": number | null,"fidelidade_desde": string | null,"fidelidade_premio": string | null,"fuso": string,"guia_feito_em": string | null,"horario": NonNullable<Json>,"id": string,"link_ativo": boolean,"link_aviso": string | null,"link_codigo": string,"link_creche": boolean,"link_hotel": boolean,"logo": string | null,"meta_mes": number | null,"modulos": (string)[] | null,"nome": string,"opcoes": NonNullable<Json>,"pago_ate": string | null,"periodo_meses": number,"plano": string,"principal": string | null,"status": Database["public"]['Enums']["status_assinatura"],"telefone": string | null,"tema": string,"teste_ate": string,"uf": string | null,"vagas": number | null,"vagas_creche": number | null,"vagas_hotel": number | null,"whatsapp": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "assinatura_desde"?: string | null,"cakto_assinatura"?: string | null,"cakto_email"?: string | null,"cidade"?: string | null,"creche_bloqueia_vacina"?: boolean,"criado_em"?: string,"criado_por"?: string | null,"diaria_creche"?: number | null,"diaria_hotel"?: number | null,"fidelidade_cada"?: number | null,"fidelidade_desde"?: string | null,"fidelidade_premio"?: string | null,"fuso"?: string,"guia_feito_em"?: string | null,"horario"?: NonNullable<Json>,"id"?: string,"link_ativo"?: boolean,"link_aviso"?: string | null,"link_codigo"?: string,"link_creche"?: boolean,"link_hotel"?: boolean,"logo"?: string | null,"meta_mes"?: number | null,"modulos"?: (string)[] | null,"nome": string,"opcoes"?: NonNullable<Json>,"pago_ate"?: string | null,"periodo_meses"?: number,"plano"?: string,"principal"?: string | null,"status"?: Database["public"]['Enums']["status_assinatura"],"telefone"?: string | null,"tema"?: string,"teste_ate"?: string,"uf"?: string | null,"vagas"?: number | null,"vagas_creche"?: number | null,"vagas_hotel"?: number | null,"whatsapp"?: boolean
                  }
                  Update: {
                    "assinatura_desde"?: string | null,"cakto_assinatura"?: string | null,"cakto_email"?: string | null,"cidade"?: string | null,"creche_bloqueia_vacina"?: boolean,"criado_em"?: string,"criado_por"?: string | null,"diaria_creche"?: number | null,"diaria_hotel"?: number | null,"fidelidade_cada"?: number | null,"fidelidade_desde"?: string | null,"fidelidade_premio"?: string | null,"fuso"?: string,"guia_feito_em"?: string | null,"horario"?: NonNullable<Json>,"id"?: string,"link_ativo"?: boolean,"link_aviso"?: string | null,"link_codigo"?: string,"link_creche"?: boolean,"link_hotel"?: boolean,"logo"?: string | null,"meta_mes"?: number | null,"modulos"?: (string)[] | null,"nome"?: string,"opcoes"?: NonNullable<Json>,"pago_ate"?: string | null,"periodo_meses"?: number,"plano"?: string,"principal"?: string | null,"status"?: Database["public"]['Enums']["status_assinatura"],"telefone"?: string | null,"tema"?: string,"teste_ate"?: string,"uf"?: string | null,"vagas"?: number | null,"vagas_creche"?: number | null,"vagas_hotel"?: number | null,"whatsapp"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"precos_alterados": {
                  Row: {
                    "abaixo_do_custo": boolean,"de": number | null,"id": string,"item": string,"lancamento_id": string | null,"pacote_cliente_id": string | null,"para": number,"petshop_id": string,"qtd": number | null,"quando": string,"quem": string | null,"quem_nome": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "abaixo_do_custo"?: boolean,"de"?: number | null,"id"?: string,"item": string,"lancamento_id"?: string | null,"pacote_cliente_id"?: string | null,"para": number,"petshop_id": string,"qtd"?: number | null,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null,"tipo": string
                  }
                  Update: {
                    "abaixo_do_custo"?: boolean,"de"?: number | null,"id"?: string,"item"?: string,"lancamento_id"?: string | null,"pacote_cliente_id"?: string | null,"para"?: number,"petshop_id"?: string,"qtd"?: number | null,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "precos_alterados_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "precos_alterados_pacote_cliente_id_fkey"
      columns: ["pacote_cliente_id"]
isOneToOne: false
      referencedRelation: "pacotes_clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "precos_alterados_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"presenca": {
                  Row: {
                    "area": string | null,"contado_em": string,"petshop_id": string,"user_id": string,"visto_em": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area"?: string | null,"contado_em"?: string,"petshop_id": string,"user_id": string,"visto_em"?: string
                  }
                  Update: {
                    "area"?: string | null,"contado_em"?: string,"petshop_id"?: string,"user_id"?: string,"visto_em"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "presenca_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"produtos": {
                  Row: {
                    "ativo": boolean,"categoria": string | null,"codigo_barras": string | null,"criado_em": string,"custo": number | null,"estoque": number,"estoque_minimo": number,"fornecedor_id": string | null,"id": string,"nome": string,"petshop_id": string,"preco_venda": number | null,"ultimo_custo": number | null,"unidade": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"categoria"?: string | null,"codigo_barras"?: string | null,"criado_em"?: string,"custo"?: number | null,"estoque"?: number,"estoque_minimo"?: number,"fornecedor_id"?: string | null,"id"?: string,"nome": string,"petshop_id": string,"preco_venda"?: number | null,"ultimo_custo"?: number | null,"unidade"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"categoria"?: string | null,"codigo_barras"?: string | null,"criado_em"?: string,"custo"?: number | null,"estoque"?: number,"estoque_minimo"?: number,"fornecedor_id"?: string | null,"id"?: string,"nome"?: string,"petshop_id"?: string,"preco_venda"?: number | null,"ultimo_custo"?: number | null,"unidade"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "produtos_fornecedor_fkey"
      columns: ["fornecedor_id","petshop_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "produtos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"profissionais": {
                  Row: {
                    "acessos": (string)[] | null,"atende": boolean,"ativo": boolean,"comissao_pct": number,"cor": string,"criado_em": string,"email_convite": string | null,"escala": Json | null,"funcao": string | null,"id": string,"nome": string,"papel": Database["public"]['Enums']["papel_equipe"],"petshop_id": string,"user_id": string | null,"ve_financeiro": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "acessos"?: (string)[] | null,"atende"?: boolean,"ativo"?: boolean,"comissao_pct"?: number,"cor"?: string,"criado_em"?: string,"email_convite"?: string | null,"escala"?: Json | null,"funcao"?: string | null,"id"?: string,"nome": string,"papel"?: Database["public"]['Enums']["papel_equipe"],"petshop_id": string,"user_id"?: string | null,"ve_financeiro"?: boolean
                  }
                  Update: {
                    "acessos"?: (string)[] | null,"atende"?: boolean,"ativo"?: boolean,"comissao_pct"?: number,"cor"?: string,"criado_em"?: string,"email_convite"?: string | null,"escala"?: Json | null,"funcao"?: string | null,"id"?: string,"nome"?: string,"papel"?: Database["public"]['Enums']["papel_equipe"],"petshop_id"?: string,"user_id"?: string | null,"ve_financeiro"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "profissionais_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"series_agenda": {
                  Row: {
                    "cada_semanas": number,"criado_em": string,"encerrada_em": string | null,"petshop_id": string,"serie_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cada_semanas": number,"criado_em"?: string,"encerrada_em"?: string | null,"petshop_id": string,"serie_id": string
                  }
                  Update: {
                    "cada_semanas"?: number,"criado_em"?: string,"encerrada_em"?: string | null,"petshop_id"?: string,"serie_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_agenda_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"servicos": {
                  Row: {
                    "ativo": boolean,"categoria": string,"cor": string,"criado_em": string,"duracao_min": number,"id": string,"nome": string,"ordem": number,"petshop_id": string,"preco_g": number | null,"preco_gg": number | null,"preco_m": number | null,"preco_p": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"categoria"?: string,"cor"?: string,"criado_em"?: string,"duracao_min"?: number,"id"?: string,"nome": string,"ordem"?: number,"petshop_id": string,"preco_g"?: number | null,"preco_gg"?: number | null,"preco_m"?: number | null,"preco_p"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean,"categoria"?: string,"cor"?: string,"criado_em"?: string,"duracao_min"?: number,"id"?: string,"nome"?: string,"ordem"?: number,"petshop_id"?: string,"preco_g"?: number | null,"preco_gg"?: number | null,"preco_m"?: number | null,"preco_p"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "servicos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"uso_diario": {
                  Row: {
                    "area": string,"dia": string,"minutos": number,"petshop_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"dia": string,"minutos"?: number,"petshop_id": string,"user_id": string
                  }
                  Update: {
                    "area"?: string,"dia"?: string,"minutos"?: number,"petshop_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "uso_diario_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "acesso_liberado":
{ Args: { "p": string }; Returns: boolean
                           },
"admin_atualizar":
{ Args: { "p_nota"?: string,"p_petshop": string,"p_plano"?: string,"p_status"?: Database["public"]['Enums']["status_assinatura"],"p_teste_ate"?: string }; Returns: undefined
                           },
"admin_conversas":
{ Args: { "p_canal"?: string,"p_limite"?: number,"p_petshop"?: string }; Returns: Json
                           },
"admin_escola":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_escola_liberar":
{ Args: { "p_email": string,"p_slug": string,"p_tirar"?: boolean }; Returns: undefined
                           },
"admin_eventos_cakto":
{ Args: Record<PropertyKey, never>; Returns: {
              "email": string | null,
"evento": string | null,
"id": number,
"payload": Json | null,
"petshop_id": string | null,
"recebido_em": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "cakto_eventos"
        isOneToOne: false
        isSetofReturn: true
      } },
"admin_painel":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_uso":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agendamento_servicos_definir":
{ Args: { "p_agendamento": string,"p_servicos": Json }; Returns: number
                           },
"agendamentos_para_cobrar":
{ Args: { "p": string,"p_ate"?: string,"p_de"?: string }; Returns: {
              "id": string,"inicio": string
            }[]
                           },
"alteracoes_de_valores":
{ Args: { "p": string,"p_todas"?: boolean }; Returns: {
              "abaixo_do_custo": boolean,"de": number,"descricao": string,"id": string,"nova": boolean,"para": number,"quando": string,"quem_nome": string,"tipo": string
            }[]
                           },
"alteracoes_marcar_vistas":
{ Args: { "p": string }; Returns: undefined
                           },
"avaliar_conversa":
{ Args: { "p_id": string,"p_pediu_equipe"?: boolean,"p_resolveu"?: boolean }; Returns: undefined
                           },
"caixa_esperado":
{ Args: { "p_caixa": string }; Returns: number
                           },
"cakto_evento":
{ Args: { "p_assinatura": string,"p_email": string,"p_evento": string,"p_oferta"?: string,"p_payload": Json,"p_segredo": string }; Returns: string
                           },
"casa_quem_escreve":
{ Args: { "p_petshop": string }; Returns: string
                           },
"clientes_juntar":
{ Args: { "p_de": string,"p_para": string }; Returns: Json
                           },
"comissao_calcular":
{ Args: { "p_ate": string,"p_de": string,"p_petshop": string,"p_profissional"?: string }; Returns: {
              "atendimentos": number,"base": number,"base_produtos": number,"com_pacote": number,"comissao": number,"comissao_produtos": number,"comissao_servicos": number,"profissional_id": string
            }[]
                           },
"comissao_do_periodo":
{ Args: { "p_ate": string,"p_de": string,"p_petshop": string }; Returns: {
              "atendimentos": number,"ativo": boolean,"base": number,"base_produtos": number,"com_pacote": number,"comissao": number,"comissao_produtos": number,"comissao_servicos": number,"cor": string,"nome": string,"pct": number,"profissional_id": string
            }[]
                           },
"comissao_pagar":
{ Args: { "p_ate": string,"p_chave"?: string,"p_de": string,"p_forma": string,"p_profissional": string,"p_valor": number }; Returns: string
                           },
"comissao_pendencias":
{ Args: { "p_petshop": string }; Returns: {
              "ate": string,"comissao": number,"de": string,"falta": number,"nome": string,"pago": number,"profissional_id": string
            }[]
                           },
"conflitos_agenda":
{ Args: { "p_fim": string,"p_ignorar"?: string,"p_inicio": string,"p_petshop": string,"p_profissional": string }; Returns: {
              "checklist": NonNullable<Json>,
"criado_em": string,
"criado_por": string | null,
"endereco_leva_traz": string | null,
"fim": string,
"foto_antes": string | null,
"foto_depois": string | null,
"id": string,
"inicio": string,
"lembrete_em": string | null,
"leva_traz": boolean,
"obs": string | null,
"origem": string,
"pacote_cliente_id": string | null,
"pet_id": string,
"petshop_id": string,
"preco": number | null,
"profissional_id": string | null,
"pronto_avisado_em": string | null,
"sem_cobranca": boolean,
"serie_id": string | null,
"servico_id": string | null,
"status": Database["public"]['Enums']["status_agendamento"]
            }[]
                          SetofOptions: {
        from: "*"
        to: "agendamentos"
        isOneToOne: false
        isSetofReturn: true
      } },
"creche_abre":
{ Args: { "p_dia": string,"p_horario": Json }; Returns: boolean
                           },
"creche_atraso_anotar":
{ Args: { "p_estadia": string }; Returns: boolean
                           },
"creche_atraso_decidir":
{ Args: { "p_decisao": string,"p_estadia": string,"p_lancamento"?: string,"p_valor"?: number }; Returns: Json
                           },
"creche_chamada":
{ Args: { "p_acao": string,"p_avisou"?: boolean,"p_dia": string,"p_forcar"?: boolean,"p_plano": string }; Returns: Json
                           },
"creche_cobranca_cancelar":
{ Args: { "p_id": string }; Returns: undefined
                           },
"creche_cobranca_cobrada":
{ Args: { "p_desfazer"?: boolean,"p_ids": (string)[] }; Returns: string
                           },
"creche_cobranca_criar":
{ Args: { "p_desconto"?: number,"p_mes": string,"p_obs"?: string,"p_plano": string,"p_reabrir"?: boolean,"p_valor"?: number,"p_vencimento"?: string }; Returns: string
                           },
"creche_cobranca_desfazer_baixa":
{ Args: { "p_id": string }; Returns: undefined
                           },
"creche_cobranca_editar":
{ Args: { "p_desconto": number,"p_id": string,"p_obs"?: string,"p_valor": number,"p_vencimento": string }; Returns: undefined
                           },
"creche_cobranca_lancar":
{ Args: { "p_id": string }; Returns: undefined
                           },
"creche_cobranca_paga":
{ Args: { "p_lancamento": string }; Returns: boolean
                           },
"creche_cobrancas_por_fora":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"creche_gerar_cobrancas":
{ Args: { "p_petshop": string }; Returns: number
                           },
"creche_nome_mes":
{ Args: { "p": string }; Returns: string
                           },
"creche_planos_ocupam":
{ Args: { "p_dia": string,"p_hoje": string,"p_petshop": string }; Returns: number
                           },
"creche_reposicao_decidir":
{ Args: { "p_decisao": string,"p_estadia": string }; Returns: undefined
                           },
"creche_reservar_extra":
{ Args: { "p_dia": string,"p_obs"?: string,"p_plano": string }; Returns: string
                           },
"creche_saida_atrasada":
{ Args: { "p_petshop": string,"p_quando": string }; Returns: string
                           },
"creche_sugestao_mensal":
{ Args: { "p_mes": string,"p_plano": string,"p_valor": number }; Returns: number
                           },
"creche_vacinas_vencidas":
{ Args: { "p_hoje": string,"p_pet": string }; Returns: string
                           },
"criar_petshop":
{ Args: { "p_cidade"?: string,"p_modulos"?: (string)[],"p_nome": string,"p_principal"?: string,"p_seu_nome": string,"p_telefone"?: string,"p_uf"?: string }; Returns: string
                           },
"cuido_do_financeiro":
{ Args: { "p": string }; Returns: boolean
                           },
"custos_das_compras":
{ Args: { "p": string,"p_fornecedor": string }; Returns: {
              "custo_unitario": number,"id": string
            }[]
                           },
"custos_das_vendas":
{ Args: { "p": string,"p_ate": string,"p_de": string }; Returns: {
              "criado_em": string,"custo_unitario": number,"id": string,"lancamento_id": string,"produto_id": string,"quantidade": number
            }[]
                           },
"custos_dos_movimentos":
{ Args: { "p_produto": string }; Returns: {
              "custo_unitario": number,"id": string
            }[]
                           },
"custos_dos_movimentos_do_petshop":
{ Args: { "p": string }; Returns: {
              "custo_unitario": number,"id": string
            }[]
                           },
"custos_dos_produtos":
{ Args: { "p": string }; Returns: {
              "custo": number,"id": string
            }[]
                           },
"dia_fechado":
{ Args: { "p_dia": string,"p_petshop": string }; Returns: boolean
                           },
"dia_iso":
{ Args: { "p": string }; Returns: string
                           },
"diaria_sugerida":
{ Args: { "p_petshop": string,"p_porte": string,"p_tipo": string }; Returns: number
                           },
"entrar":
{ Args: Record<PropertyKey, never>; Returns: {
              "acessos": (string)[] | null,
"atende": boolean,
"ativo": boolean,
"comissao_pct": number,
"cor": string,
"criado_em": string,
"email_convite": string | null,
"escala": Json | null,
"funcao": string | null,
"id": string,
"nome": string,
"papel": Database["public"]['Enums']["papel_equipe"],
"petshop_id": string,
"user_id": string | null,
"ve_financeiro": boolean
            }[]
                          SetofOptions: {
        from: "*"
        to: "profissionais"
        isOneToOne: false
        isSetofReturn: true
      } },
"equipe_reservado":
{ Args: { "p": string }; Returns: {
              "comissao_pct": number,"email_convite": string,"id": string
            }[]
                           },
"escola_evento":
{ Args: { "p_email": string,"p_evento": string,"p_pedido"?: string,"p_segredo": string,"p_slug": string }; Returns: string
                           },
"estadia_acertar":
{ Args: { "p_diarias": number,"p_id": string,"p_obs"?: string,"p_valor": number }; Returns: boolean
                           },
"estadia_ocupa":
{ Args: { "p_dia": string,"p_entrada": string,"p_hoje": string,"p_saida": string,"p_status": string,"p_tipo": string }; Returns: boolean
                           },
"estadias_para_cobrar":
{ Args: { "p": string }; Returns: {
              "id": string,"saida": string
            }[]
                           },
"estadias_reservado":
{ Args: { "p": string,"p_ids"?: (string)[] }; Returns: {
              "id": string,"valor_cobrado": number,"valor_diaria": number
            }[]
                           },
"fechar_caixa":
{ Args: { "p_caixa": string,"p_contado": number,"p_esperado"?: number,"p_obs"?: string }; Returns: Json
                           },
"fone_plausivel":
{ Args: { "p": string }; Returns: boolean
                           },
"fuso_da_uf":
{ Args: { "p_uf": string }; Returns: string
                           },
"hotel_noite":
{ Args: { "p_base": number,"p_dia": string,"p_petshop": string,"p_segundo": boolean }; Returns: {
              "cheia": number,"desconto": number,"marca": string,"valor": number
            }[]
                           },
"hotel_previsto":
{ Args: { "p_estadia": string }; Returns: number
                           },
"importacao_desfazer":
{ Args: { "p_clientes": (string)[],"p_pets": (string)[],"p_petshop": string }; Returns: Json
                           },
"limite_de_acessos":
{ Args: { "p_plano": string }; Returns: number
                           },
"link_espera_ativa":
{ Args: { "p_codigo": string }; Returns: boolean
                           },
"link_espera_pedir":
{ Args: { "p_codigo": string,"p_entrada": string,"p_especie"?: string,"p_obs"?: string,"p_pet": string,"p_porte"?: string,"p_saida": string,"p_telefone": string,"p_tipo": string,"p_tutor": string }; Returns: Json
                           },
"link_estadia_cheios":
{ Args: { "p_ate": string,"p_codigo": string,"p_de": string,"p_tipo": string }; Returns: string[]
                           },
"link_fechados":
{ Args: { "p_codigo": string }; Returns: string[]
                           },
"link_horarios":
{ Args: { "p_codigo": string,"p_dia": string,"p_pets"?: number,"p_servico": string }; Returns: string[]
                           },
"link_hotel_estimativa":
{ Args: { "p_codigo": string,"p_entrada": string,"p_juntos"?: boolean,"p_pets": Json,"p_saida": string }; Returns: Json
                           },
"link_hotel_opcoes":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"link_info":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"link_nome":
{ Args: { "p_codigo": string }; Returns: string
                           },
"link_opcoes":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"link_opcoes_de":
{ Args: { "p_opcoes": Json }; Returns: Json
                           },
"link_pedido":
{ Args: { "p_id": string }; Returns: Json
                           },
"link_pedido_cancelar":
{ Args: { "p_id": string,"p_recado"?: string }; Returns: Json
                           },
"link_pedido_cliente":
{ Args: { "p_id": string }; Returns: Json
                           },
"link_pedido_itens":
{ Args: { "p_id": string }; Returns: {
              "chave": string,"comeca": string,"dinheiro": boolean,"estado": string,"id": string
            }[]
                           },
"link_pedido_pedir_mudanca":
{ Args: { "p_id": string,"p_recado": string }; Returns: Json
                           },
"link_pedido_sinal":
{ Args: { "p_id": string }; Returns: Json
                           },
"link_pedir":
{ Args: { "p_codigo": string,"p_dia": string,"p_especie"?: string,"p_hora": string,"p_obs"?: string,"p_outros"?: Json,"p_pet": string,"p_porte"?: string,"p_servico": string,"p_telefone": string,"p_tutor": string }; Returns: Json
                           },
"link_pedir_com_termos":
{ Args: { "p_args": Json,"p_funcao": string,"p_termos"?: string,"p_vacinas"?: boolean }; Returns: Json
                           },
"link_pedir_estadia":
{ Args: { "p_codigo": string,"p_entrada": string,"p_especie"?: string,"p_hora_entrada"?: string,"p_hora_saida"?: string,"p_mais_pets"?: Json,"p_obs"?: string,"p_pet": string,"p_porte"?: string,"p_saida": string,"p_telefone": string,"p_tipo": string,"p_tutor": string }; Returns: Json
                           },
"link_vaga":
{ Args: { "p_fim": string,"p_inicio": string,"p_petshop": string }; Returns: boolean
                           },
"marcar_uso":
{ Args: { "p_area": string,"p_petshop": string }; Returns: undefined
                           },
"meu_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"meus_caixas":
{ Args: Record<PropertyKey, never>; Returns: {
              "caixa_id": string,"hoje": string,"petshop_id": string
            }[]
                           },
"meus_petshops":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"minha_comissao":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"opcoes_sem_valores":
{ Args: { "o": Json }; Returns: Json
                           },
"pagamentos_conferidos":
{ Args: { "p_pagamentos": Json,"p_total": number }; Returns: Json
                           },
"parte_em_dinheiro":
{ Args: { "p_forma": string,"p_pagamentos": Json,"p_valor": number }; Returns: number
                           },
"partes_da_conta":
{ Args: { "p_conta": string }; Returns: {
              "criado_em": string,"data": string,"forma": string,"id": string,"pagamentos": Json,"quem": string,"valor": number
            }[]
                           },
"partes_do_lancamento":
{ Args: { "p_itens": Json,"p_valor": number }; Returns: {
              "extra": number,"produto": number,"servico": number
            }[]
                           },
"partes_por_servico":
{ Args: { "p_agendamento": string,"p_com_itens": boolean,"p_itens": Json,"p_total": number }; Returns: {
              "servico_id": string,"valor": number
            }[]
                           },
"pedido_aceitar":
{ Args: { "p_forcar"?: boolean,"p_id": string,"p_profissional"?: string }; Returns: string
                           },
"pedido_aceitar_como":
{ Args: { "p_forcar"?: boolean,"p_id": string,"p_profissional"?: string,"p_tutor_novo"?: boolean }; Returns: string
                           },
"pedido_acertar_diaria":
{ Args: { "p_id": string }; Returns: undefined
                           },
"pedido_criar_sinal":
{ Args: { "p_id": string }; Returns: Json
                           },
"pedido_tutores_do_telefone":
{ Args: { "p_id": string }; Returns: {
              "id": string,"nome": string,"telefone": string
            }[]
                           },
"petshop_opcoes":
{ Args: { "p": string }; Returns: Json
                           },
"petshop_reservado":
{ Args: { "p": string }; Returns: {
              "id": string,"meta_mes": number
            }[]
                           },
"petshop_salvar_opcoes":
{ Args: { "p": string,"p_mudancas": Json }; Returns: undefined
                           },
"petshops_do_financeiro":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"precos_dos_pacotes":
{ Args: { "p": string }; Returns: {
              "id": string,"preco": number,"vendido": boolean
            }[]
                           },
"produtos_reservado":
{ Args: { "p": string }; Returns: {
              "custo": number,"id": string,"ultimo_custo": number
            }[]
                           },
"receber_conta":
{ Args: { "p_chave"?: string,"p_conta": string,"p_data"?: string,"p_forma": string,"p_multa"?: number,"p_multa_forma"?: string,"p_multa_pagamentos"?: Json,"p_novo_vencimento"?: string,"p_pagamentos"?: Json,"p_valor": number }; Returns: Json
                           },
"recebido_em_partes":
{ Args: { "p_conta": string }; Returns: number
                           },
"recebimentos_do_agendamento":
{ Args: { "p_agendamento": string }; Returns: {
              "agendamento_id": string | null,
"alterado_em": string | null,
"caixa_id": string | null,
"categoria": string,
"chave": string | null,
"cliente_id": string | null,
"cobrado_em": string | null,
"conta_id": string | null,
"criado_em": string,
"criado_por": string | null,
"data": string,
"descricao": string | null,
"forma": string | null,
"id": string,
"itens": Json | null,
"movimento": string | null,
"multa_de": string | null,
"multa_recebida": number | null,
"multa_recebida_em": string | null,
"origem": string,
"pagamentos": Json | null,
"pago": boolean,
"petshop_id": string,
"tipo": string,
"valor": number,
"valor_original": number | null,
"vencimento": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "lancamentos"
        isOneToOne: false
        isSetofReturn: true
      } },
"registrar_conversa":
{ Args: { "p_canal": string,"p_pediu_equipe"?: boolean,"p_pergunta": string,"p_petshop": string,"p_resposta": string }; Returns: string
                           },
"serie_continuar":
{ Args: { "p_depois_de": string,"p_serie": string,"p_vezes"?: number }; Returns: number
                           },
"series_acabando":
{ Args: { "p": string }; Returns: {
              "cada_semanas": number,"pet_id": string,"pet_nome": string,"restantes": number,"serie_id": string,"servico_nome": string,"tutor_nome": string,"ultimo": string
            }[]
                           },
"sou_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"sou_dono":
{ Args: { "p": string }; Returns: boolean
                           },
"telefone_limpo":
{ Args: { "p": string }; Returns: string
                           },
"tenho_area":
{ Args: { "p": string,"p_areas": (string)[] }; Returns: boolean
                           },
"tirar_acesso":
{ Args: { "p_id": string }; Returns: undefined
                           },
"vejo_financeiro":
{ Args: { "p": string }; Returns: boolean
                           }
          }
          Enums: {
            "papel_equipe": "dono"|"gerente"|"funcionario","status_agendamento": "marcado"|"confirmado"|"em_atendimento"|"concluido"|"faltou"|"cancelado","status_assinatura": "teste"|"ativa"|"atrasada"|"cancelada"|"cortesia"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "papel_equipe": ["dono", "gerente", "funcionario"],"status_agendamento": ["marcado", "confirmado", "em_atendimento", "concluido", "faltou", "cancelado"],"status_assinatura": ["teste", "ativa", "atrasada", "cancelada", "cortesia"]
          }
        }
} as const
