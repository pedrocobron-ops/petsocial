
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
            "aceites": {
                  Row: {
                    "aceito_em": string,"documento": string,"email": string | null,"id": number,"ip": string | null,"navegador": string | null,"origem": string,"user_id": string | null,"versao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aceito_em"?: string,"documento": string,"email"?: string | null,"id"?: never,"ip"?: string | null,"navegador"?: string | null,"origem": string,"user_id"?: string | null,"versao": string
                  }
                  Update: {
                    "aceito_em"?: string,"documento"?: string,"email"?: string | null,"id"?: never,"ip"?: string | null,"navegador"?: string | null,"origem"?: string,"user_id"?: string | null,"versao"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admin_empresa_passos": {
                  Row: {
                    "feito_em": string,"feito_por": string | null,"passo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "feito_em"?: string,"feito_por"?: string | null,"passo": string
                  }
                  Update: {
                    "feito_em"?: string,"feito_por"?: string | null,"passo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admins": {
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
                    "checklist": NonNullable<Json>,"concluido_servicos": string | null,"criado_em": string,"criado_por": string | null,"endereco_leva_traz": string | null,"fim": string,"foto_antes": string | null,"foto_depois": string | null,"id": string,"inicio": string,"lembrete_em": string | null,"leva_traz": boolean,"obs": string | null,"origem": string,"pacote_cliente_id": string | null,"pet_id": string,"petshop_id": string,"preco": number | null,"profissional_id": string | null,"promo": Json | null,"pronto_avisado_em": string | null,"remarcado_em": string | null,"sem_cobranca": boolean,"sem_cobranca_em": string | null,"sem_cobranca_nome": string | null,"sem_cobranca_por": string | null,"serie_id": string | null,"servico_id": string | null,"status": Database["public"]['Enums']["status_agendamento"],"valor_concluido": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "checklist"?: NonNullable<Json>,"concluido_servicos"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"endereco_leva_traz"?: string | null,"fim": string,"foto_antes"?: string | null,"foto_depois"?: string | null,"id"?: string,"inicio": string,"lembrete_em"?: string | null,"leva_traz"?: boolean,"obs"?: string | null,"origem"?: string,"pacote_cliente_id"?: string | null,"pet_id": string,"petshop_id": string,"preco"?: number | null,"profissional_id"?: string | null,"promo"?: Json | null,"pronto_avisado_em"?: string | null,"remarcado_em"?: string | null,"sem_cobranca"?: boolean,"sem_cobranca_em"?: string | null,"sem_cobranca_nome"?: string | null,"sem_cobranca_por"?: string | null,"serie_id"?: string | null,"servico_id"?: string | null,"status"?: Database["public"]['Enums']["status_agendamento"],"valor_concluido"?: number | null
                  }
                  Update: {
                    "checklist"?: NonNullable<Json>,"concluido_servicos"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"endereco_leva_traz"?: string | null,"fim"?: string,"foto_antes"?: string | null,"foto_depois"?: string | null,"id"?: string,"inicio"?: string,"lembrete_em"?: string | null,"leva_traz"?: boolean,"obs"?: string | null,"origem"?: string,"pacote_cliente_id"?: string | null,"pet_id"?: string,"petshop_id"?: string,"preco"?: number | null,"profissional_id"?: string | null,"promo"?: Json | null,"pronto_avisado_em"?: string | null,"remarcado_em"?: string | null,"sem_cobranca"?: boolean,"sem_cobranca_em"?: string | null,"sem_cobranca_nome"?: string | null,"sem_cobranca_por"?: string | null,"serie_id"?: string | null,"servico_id"?: string | null,"status"?: Database["public"]['Enums']["status_agendamento"],"valor_concluido"?: number | null
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
                },"album_acessos": {
                  Row: {
                    "album_id": string,"minuto": string,"n": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "album_id": string,"minuto": string,"n"?: number,"tipo": string
                  }
                  Update: {
                    "album_id"?: string,"minuto"?: string,"n"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "album_acessos_album_id_fkey"
      columns: ["album_id"]
isOneToOne: false
      referencedRelation: "albuns"
      referencedColumns: ["id"]
    }
                  ]
                },"albuns": {
                  Row: {
                    "criado_em": string,"criado_por": string | null,"expira_em": string,"id": string,"itens": NonNullable<Json>,"pet_id": string,"petshop_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_por"?: string | null,"expira_em"?: string,"id"?: string,"itens"?: NonNullable<Json>,"pet_id": string,"petshop_id": string,"token": string
                  }
                  Update: {
                    "criado_em"?: string,"criado_por"?: string | null,"expira_em"?: string,"id"?: string,"itens"?: NonNullable<Json>,"pet_id"?: string,"petshop_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "albuns_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "albuns_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
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
                },"arquivos_lixo": {
                  Row: {
                    "bucket": string,"caminho": string,"criado_em": string,"motivo": string,"petshop_id": string | null,"tentativas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"caminho": string,"criado_em"?: string,"motivo": string,"petshop_id"?: string | null,"tentativas"?: number
                  }
                  Update: {
                    "bucket"?: string,"caminho"?: string,"criado_em"?: string,"motivo"?: string,"petshop_id"?: string | null,"tentativas"?: number
                  }
                  Relationships: [
                    
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
                },"assistente_uso": {
                  Row: {
                    "canal": string,"chamadas": number,"dia": string,"pedidos": number,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canal": string,"chamadas"?: number,"dia": string,"pedidos"?: number,"petshop_id": string
                  }
                  Update: {
                    "canal"?: string,"chamadas"?: number,"dia"?: string,"pedidos"?: number,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assistente_uso_petshop_id_fkey"
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
                },"boletim_acessos": {
                  Row: {
                    "boletim_id": string,"minuto": string,"n": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "boletim_id": string,"minuto": string,"n"?: number,"tipo": string
                  }
                  Update: {
                    "boletim_id"?: string,"minuto"?: string,"n"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "boletim_acessos_boletim_id_fkey"
      columns: ["boletim_id"]
isOneToOne: false
      referencedRelation: "boletins"
      referencedColumns: ["id"]
    }
                  ]
                },"boletim_ia_uso": {
                  Row: {
                    "dia": string,"petshop_id": string,"textos": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dia": string,"petshop_id": string,"textos"?: number
                  }
                  Update: {
                    "dia"?: string,"petshop_id"?: string,"textos"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "boletim_ia_uso_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"boletim_lixo": {
                  Row: {
                    "caminho": string,"criado_em": string,"motivo": string,"petshop_id": string,"tentativas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"criado_em"?: string,"motivo"?: string,"petshop_id": string,"tentativas"?: number
                  }
                  Update: {
                    "caminho"?: string,"criado_em"?: string,"motivo"?: string,"petshop_id"?: string,"tentativas"?: number
                  }
                  Relationships: [
                    
                  ]
                },"boletins": {
                  Row: {
                    "agendamento_id": string | null,"assinaturas": (string)[],"atencao": string | null,"atualizado_em": string,"chips": NonNullable<Json>,"criado_em": string,"criado_por": string | null,"enviado_em": string | null,"estadia_id": string | null,"expira_em": string,"fotos": (string)[],"id": string,"nota": string | null,"pet_id": string,"petshop_id": string,"texto": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"assinaturas"?: (string)[],"atencao"?: string | null,"atualizado_em"?: string,"chips"?: NonNullable<Json>,"criado_em"?: string,"criado_por"?: string | null,"enviado_em"?: string | null,"estadia_id"?: string | null,"expira_em"?: string,"fotos"?: (string)[],"id"?: string,"nota"?: string | null,"pet_id": string,"petshop_id": string,"texto"?: string,"token": string
                  }
                  Update: {
                    "agendamento_id"?: string | null,"assinaturas"?: (string)[],"atencao"?: string | null,"atualizado_em"?: string,"chips"?: NonNullable<Json>,"criado_em"?: string,"criado_por"?: string | null,"enviado_em"?: string | null,"estadia_id"?: string | null,"expira_em"?: string,"fotos"?: (string)[],"id"?: string,"nota"?: string | null,"pet_id"?: string,"petshop_id"?: string,"texto"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "boletins_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boletins_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boletins_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "boletins_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"caderno_reservas": {
                  Row: {
                    "criado_em": string,"dia": string,"id": string,"paginas": number,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"dia": string,"id"?: string,"paginas": number,"petshop_id": string
                  }
                  Update: {
                    "criado_em"?: string,"dia"?: string,"id"?: string,"paginas"?: number,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "caderno_reservas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"caderno_uso": {
                  Row: {
                    "dia": string,"leituras": number,"paginas": number,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dia": string,"leituras"?: number,"paginas"?: number,"petshop_id": string
                  }
                  Update: {
                    "dia"?: string,"leituras"?: number,"paginas"?: number,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "caderno_uso_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
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
                },"cakto_callbacks": {
                  Row: {
                    "criado_em": string,"ficha": string,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"ficha"?: string,"petshop_id": string
                  }
                  Update: {
                    "criado_em"?: string,"ficha"?: string,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cakto_callbacks_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: true
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
                    "criado_em": string,"email": string | null,"endereco": string | null,"id": string,"limite_fiado": number | null,"nao_quer_mensagens": boolean,"nascimento": string | null,"nome": string,"obs": string | null,"petshop_id": string,"telefone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"email"?: string | null,"endereco"?: string | null,"id"?: string,"limite_fiado"?: number | null,"nao_quer_mensagens"?: boolean,"nascimento"?: string | null,"nome": string,"obs"?: string | null,"petshop_id": string,"telefone"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"email"?: string | null,"endereco"?: string | null,"id"?: string,"limite_fiado"?: number | null,"nao_quer_mensagens"?: boolean,"nascimento"?: string | null,"nome"?: string,"obs"?: string | null,"petshop_id"?: string,"telefone"?: string | null
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
                },"clientes_creditos": {
                  Row: {
                    "chave": string | null,"cliente_id": string,"criado_em": string,"criado_por": string | null,"estadia_id": string | null,"id": string,"lancamento_id": string | null,"motivo": string | null,"petshop_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chave"?: string | null,"cliente_id": string,"criado_em"?: string,"criado_por"?: string | null,"estadia_id"?: string | null,"id"?: string,"lancamento_id"?: string | null,"motivo"?: string | null,"petshop_id": string,"valor": number
                  }
                  Update: {
                    "chave"?: string | null,"cliente_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"estadia_id"?: string | null,"id"?: string,"lancamento_id"?: string | null,"motivo"?: string | null,"petshop_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "clientes_creditos_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "clientes_creditos_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clientes_creditos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clientes_creditos_petshop_id_fkey"
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
                },"contagens": {
                  Row: {
                    "ajustados": number | null,"atualizado_em": string,"categoria": string | null,"chave": string | null,"concluida_em": string | null,"concluida_por": string | null,"concluida_por_nome": string | null,"criado_em": string,"criado_por": string | null,"criado_por_nome": string | null,"diferenca_valor": number | null,"fornecedor_id": string | null,"id": string,"nome": string,"petshop_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ajustados"?: number | null,"atualizado_em"?: string,"categoria"?: string | null,"chave"?: string | null,"concluida_em"?: string | null,"concluida_por"?: string | null,"concluida_por_nome"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"criado_por_nome"?: string | null,"diferenca_valor"?: number | null,"fornecedor_id"?: string | null,"id"?: string,"nome": string,"petshop_id": string,"status"?: string
                  }
                  Update: {
                    "ajustados"?: number | null,"atualizado_em"?: string,"categoria"?: string | null,"chave"?: string | null,"concluida_em"?: string | null,"concluida_por"?: string | null,"concluida_por_nome"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"criado_por_nome"?: string | null,"diferenca_valor"?: number | null,"fornecedor_id"?: string | null,"id"?: string,"nome"?: string,"petshop_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contagens_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"contagens_itens": {
                  Row: {
                    "ajustado_de": number | null,"ajustado_para": number | null,"contado": number | null,"contado_em": string | null,"contado_por": string | null,"contagem_id": string,"custo": number | null,"esperado": number | null,"movimento_id": string | null,"petshop_id": string,"produto_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ajustado_de"?: number | null,"ajustado_para"?: number | null,"contado"?: number | null,"contado_em"?: string | null,"contado_por"?: string | null,"contagem_id": string,"custo"?: number | null,"esperado"?: number | null,"movimento_id"?: string | null,"petshop_id": string,"produto_id": string
                  }
                  Update: {
                    "ajustado_de"?: number | null,"ajustado_para"?: number | null,"contado"?: number | null,"contado_em"?: string | null,"contado_por"?: string | null,"contagem_id"?: string,"custo"?: number | null,"esperado"?: number | null,"movimento_id"?: string | null,"petshop_id"?: string,"produto_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contagens_itens_contagem_id_fkey"
      columns: ["contagem_id"]
isOneToOne: false
      referencedRelation: "contagens"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contagens_itens_movimento_id_fkey"
      columns: ["movimento_id"]
isOneToOne: false
      referencedRelation: "movimentos_estoque"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contagens_itens_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contagens_itens_produto_id_fkey"
      columns: ["produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id"]
    }
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
                    "acerto_saida": boolean,"cliente_id": string | null,"cobrado_em": string | null,"criado_em": string,"criado_por": string | null,"desconto": number,"desconto_irmao": number,"extras": NonNullable<Json>,"id": string,"lancamento_id": string | null,"mes": string,"obs": string | null,"pet_id": string,"petshop_id": string,"plano_id": string,"por_fora": boolean,"status": string,"taxas": NonNullable<Json>,"total": number,"valor_cheio": number,"valor_extras": number,"valor_mensal": number,"vencimento": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acerto_saida"?: boolean,"cliente_id"?: string | null,"cobrado_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"desconto"?: number,"desconto_irmao"?: number,"extras"?: NonNullable<Json>,"id"?: string,"lancamento_id"?: string | null,"mes": string,"obs"?: string | null,"pet_id": string,"petshop_id": string,"plano_id": string,"por_fora"?: boolean,"status"?: string,"taxas"?: NonNullable<Json>,"total": number,"valor_cheio": number,"valor_extras"?: number,"valor_mensal": number,"vencimento": string
                  }
                  Update: {
                    "acerto_saida"?: boolean,"cliente_id"?: string | null,"cobrado_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"desconto"?: number,"desconto_irmao"?: number,"extras"?: NonNullable<Json>,"id"?: string,"lancamento_id"?: string | null,"mes"?: string,"obs"?: string | null,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string,"por_fora"?: boolean,"status"?: string,"taxas"?: NonNullable<Json>,"total"?: number,"valor_cheio"?: number,"valor_extras"?: number,"valor_mensal"?: number,"vencimento"?: string
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
                    "decidido_em": string | null,"decidido_por": string | null,"dia": string,"estadia_id": string,"estado": string,"falta_dia": string | null,"marcado_em": string,"marcado_por": string | null,"pet_id": string,"petshop_id": string,"plano_id": string | null,"sem_falta": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "decidido_em"?: string | null,"decidido_por"?: string | null,"dia": string,"estadia_id": string,"estado"?: string,"falta_dia"?: string | null,"marcado_em"?: string,"marcado_por"?: string | null,"pet_id": string,"petshop_id": string,"plano_id"?: string | null,"sem_falta"?: boolean
                  }
                  Update: {
                    "decidido_em"?: string | null,"decidido_por"?: string | null,"dia"?: string,"estadia_id"?: string,"estado"?: string,"falta_dia"?: string | null,"marcado_em"?: string,"marcado_por"?: string | null,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string | null,"sem_falta"?: boolean
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
                },"devolucoes": {
                  Row: {
                    "chave": string,"cliente_id": string | null,"credito_id": string | null,"criado_em": string,"criado_por": string | null,"diferenca": number | null,"entrada_id": string | null,"forma": string | null,"id": string,"itens": NonNullable<Json>,"modo": string,"novos": Json | null,"petshop_id": string,"resultado": Json | null,"saida_id": string | null,"valor": number,"valor_novos": number | null,"venda_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"cliente_id"?: string | null,"credito_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"diferenca"?: number | null,"entrada_id"?: string | null,"forma"?: string | null,"id"?: string,"itens": NonNullable<Json>,"modo": string,"novos"?: Json | null,"petshop_id": string,"resultado"?: Json | null,"saida_id"?: string | null,"valor": number,"valor_novos"?: number | null,"venda_id"?: string | null
                  }
                  Update: {
                    "chave"?: string,"cliente_id"?: string | null,"credito_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"diferenca"?: number | null,"entrada_id"?: string | null,"forma"?: string | null,"id"?: string,"itens"?: NonNullable<Json>,"modo"?: string,"novos"?: Json | null,"petshop_id"?: string,"resultado"?: Json | null,"saida_id"?: string | null,"valor"?: number,"valor_novos"?: number | null,"venda_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "devolucoes_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "devolucoes_credito_id_fkey"
      columns: ["credito_id"]
isOneToOne: false
      referencedRelation: "clientes_creditos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucoes_entrada_id_fkey"
      columns: ["entrada_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucoes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucoes_saida_id_fkey"
      columns: ["saida_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "devolucoes_venda_id_fkey"
      columns: ["venda_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    }
                  ]
                },"diario_fotos": {
                  Row: {
                    "assinatura": string | null,"assinatura_vale_ate": string | null,"bytes": number | null,"caminho": string,"criado_em": string,"criado_nome": string | null,"criado_por": string | null,"dia": string,"estadia_id": string,"id": string,"legenda": string | null,"pet_id": string,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assinatura"?: string | null,"assinatura_vale_ate"?: string | null,"bytes"?: number | null,"caminho": string,"criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"dia": string,"estadia_id": string,"id"?: string,"legenda"?: string | null,"pet_id": string,"petshop_id": string
                  }
                  Update: {
                    "assinatura"?: string | null,"assinatura_vale_ate"?: string | null,"bytes"?: number | null,"caminho"?: string,"criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"dia"?: string,"estadia_id"?: string,"id"?: string,"legenda"?: string | null,"pet_id"?: string,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "diario_fotos_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diario_fotos_pet_id_fkey"
      columns: ["pet_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diario_fotos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"diario_fotos_lixo": {
                  Row: {
                    "caminho": string,"criado_em": string,"motivo": string,"petshop_id": string,"tentativas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"criado_em"?: string,"motivo"?: string,"petshop_id": string,"tentativas"?: number
                  }
                  Update: {
                    "caminho"?: string,"criado_em"?: string,"motivo"?: string,"petshop_id"?: string,"tentativas"?: number
                  }
                  Relationships: [
                    
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
                },"entrada_acessos": {
                  Row: {
                    "entrada_id": string,"minuto": string,"n": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entrada_id": string,"minuto": string,"n"?: number,"tipo": string
                  }
                  Update: {
                    "entrada_id"?: string,"minuto"?: string,"n"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entrada_acessos_entrada_id_fkey"
      columns: ["entrada_id"]
isOneToOne: false
      referencedRelation: "entradas"
      referencedColumns: ["id"]
    }
                  ]
                },"entrada_lixo": {
                  Row: {
                    "caminho": string,"criado_em": string,"motivo": string,"petshop_id": string,"tentativas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"criado_em"?: string,"motivo"?: string,"petshop_id": string,"tentativas"?: number
                  }
                  Update: {
                    "caminho"?: string,"criado_em"?: string,"motivo"?: string,"petshop_id"?: string,"tentativas"?: number
                  }
                  Relationships: [
                    
                  ]
                },"entradas": {
                  Row: {
                    "aceite": string | null,"aceite_hash": string | null,"aceite_assinatura": string | null,"aceite_ip": string | null,"aceite_navegador": string | null,"aceite_nome": string | null,"aceito_em": string | null,"agendamento_id": string | null,"assinaturas": (string)[],"atualizado_em": string,"criado_em": string,"criado_por": string | null,"cuidados": string | null,"devolvido_em": string | null,"devolvido_por": string | null,"estadia_id": string | null,"fotos": (string)[],"id": string,"idoso_doente": boolean,"lesoes": (string)[],"lesoes_obs": string | null,"link_criado_em": string | null,"obs": string | null,"pertences": (string)[],"pertences_outros": string | null,"pet_id": string,"petshop_id": string,"temperamento": (string)[],"termo": string,"token": string | null,"token_expira": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aceite"?: string | null,"aceite_hash"?: string | null,"aceite_assinatura"?: string | null,"aceite_ip"?: string | null,"aceite_navegador"?: string | null,"aceite_nome"?: string | null,"aceito_em"?: string | null,"agendamento_id"?: string | null,"assinaturas"?: (string)[],"atualizado_em"?: string,"criado_em"?: string,"criado_por"?: string | null,"cuidados"?: string | null,"devolvido_em"?: string | null,"devolvido_por"?: string | null,"estadia_id"?: string | null,"fotos"?: (string)[],"id"?: string,"idoso_doente"?: boolean,"lesoes"?: (string)[],"lesoes_obs"?: string | null,"link_criado_em"?: string | null,"obs"?: string | null,"pertences"?: (string)[],"pertences_outros"?: string | null,"pet_id": string,"petshop_id": string,"temperamento"?: (string)[],"termo"?: string,"token"?: string | null,"token_expira"?: string | null
                  }
                  Update: {
                    "aceite"?: string | null,"aceite_hash"?: string | null,"aceite_assinatura"?: string | null,"aceite_ip"?: string | null,"aceite_navegador"?: string | null,"aceite_nome"?: string | null,"aceito_em"?: string | null,"agendamento_id"?: string | null,"assinaturas"?: (string)[],"atualizado_em"?: string,"criado_em"?: string,"criado_por"?: string | null,"cuidados"?: string | null,"devolvido_em"?: string | null,"devolvido_por"?: string | null,"estadia_id"?: string | null,"fotos"?: (string)[],"id"?: string,"idoso_doente"?: boolean,"lesoes"?: (string)[],"lesoes_obs"?: string | null,"link_criado_em"?: string | null,"obs"?: string | null,"pertences"?: (string)[],"pertences_outros"?: string | null,"pet_id"?: string,"petshop_id"?: string,"temperamento"?: (string)[],"termo"?: string,"token"?: string | null,"token_expira"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "entradas_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entradas_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entradas_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "entradas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"erros_app": {
                  Row: {
                    "aparelho": string,"areas": (string)[] | null,"assinatura": string,"contagem": number,"id": number,"mensagem": string,"navegador": string | null,"nome": string | null,"origem": string,"papel": string | null,"petshop_id": string | null,"pilha": string | null,"primeiro_em": string,"rota": string | null,"tela": string | null,"tipo": string,"ultimo_em": string,"versao": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aparelho": string,"areas"?: (string)[] | null,"assinatura": string,"contagem"?: number,"id"?: never,"mensagem": string,"navegador"?: string | null,"nome"?: string | null,"origem": string,"papel"?: string | null,"petshop_id"?: string | null,"pilha"?: string | null,"primeiro_em"?: string,"rota"?: string | null,"tela"?: string | null,"tipo": string,"ultimo_em"?: string,"versao"?: string | null
                  }
                  Update: {
                    "aparelho"?: string,"areas"?: (string)[] | null,"assinatura"?: string,"contagem"?: number,"id"?: never,"mensagem"?: string,"navegador"?: string | null,"nome"?: string | null,"origem"?: string,"papel"?: string | null,"petshop_id"?: string | null,"pilha"?: string | null,"primeiro_em"?: string,"rota"?: string | null,"tela"?: string | null,"tipo"?: string,"ultimo_em"?: string,"versao"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "erros_app_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"erros_app_contagem": {
                  Row: {
                    "dia": string,"n": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dia": string,"n"?: number,"tipo": string
                  }
                  Update: {
                    "dia"?: string,"n"?: number,"tipo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"erros_app_freio": {
                  Row: {
                    "chave": string,"janela": string,"n": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"janela": string,"n"?: number
                  }
                  Update: {
                    "chave"?: string,"janela"?: string,"n"?: number
                  }
                  Relationships: [
                    
                  ]
                },"erros_app_resolvidos": {
                  Row: {
                    "assinatura": string,"por": string | null,"resolvido_em": string,"versoes": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "assinatura": string,"por"?: string | null,"resolvido_em"?: string,"versoes"?: (string)[]
                  }
                  Update: {
                    "assinatura"?: string,"por"?: string | null,"resolvido_em"?: string,"versoes"?: (string)[]
                  }
                  Relationships: [
                    
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
                    "acomodacao": string | null,"avisos": NonNullable<Json>,"chave": string | null,"cobranca_id": string | null,"criado_em": string,"cuidados": Json | null,"dia": string | null,"diarias_cobradas": number | null,"endereco_leva_traz": string | null,"entrada": string,"experiencia": boolean,"id": string,"leva_traz_buscar": boolean,"leva_traz_levar": boolean,"mensalista": string | null,"obs": string | null,"pet_id": string,"petshop_id": string,"plano_id": string | null,"promo": Json | null,"saida": string | null,"saida_prevista": string | null,"sinal_estado": string | null,"status": string,"tipo": string,"valor_cobrado": number | null,"valor_diaria": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acomodacao"?: string | null,"avisos"?: NonNullable<Json>,"chave"?: string | null,"cobranca_id"?: string | null,"criado_em"?: string,"cuidados"?: Json | null,"dia"?: string | null,"diarias_cobradas"?: number | null,"endereco_leva_traz"?: string | null,"entrada": string,"experiencia"?: boolean,"id"?: string,"leva_traz_buscar"?: boolean,"leva_traz_levar"?: boolean,"mensalista"?: string | null,"obs"?: string | null,"pet_id": string,"petshop_id": string,"plano_id"?: string | null,"promo"?: Json | null,"saida"?: string | null,"saida_prevista"?: string | null,"sinal_estado"?: string | null,"status"?: string,"tipo": string,"valor_cobrado"?: number | null,"valor_diaria"?: number | null
                  }
                  Update: {
                    "acomodacao"?: string | null,"avisos"?: NonNullable<Json>,"chave"?: string | null,"cobranca_id"?: string | null,"criado_em"?: string,"cuidados"?: Json | null,"dia"?: string | null,"diarias_cobradas"?: number | null,"endereco_leva_traz"?: string | null,"entrada"?: string,"experiencia"?: boolean,"id"?: string,"leva_traz_buscar"?: boolean,"leva_traz_levar"?: boolean,"mensalista"?: string | null,"obs"?: string | null,"pet_id"?: string,"petshop_id"?: string,"plano_id"?: string | null,"promo"?: Json | null,"saida"?: string | null,"saida_prevista"?: string | null,"sinal_estado"?: string | null,"status"?: string,"tipo"?: string,"valor_cobrado"?: number | null,"valor_diaria"?: number | null
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
                },"estadias_checkin_feito": {
                  Row: {
                    "entrada_reservada": string,"estadia_id": string,"feito_em": string,"feito_por": string | null,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entrada_reservada": string,"estadia_id": string,"feito_em"?: string,"feito_por"?: string | null,"petshop_id": string
                  }
                  Update: {
                    "entrada_reservada"?: string,"estadia_id"?: string,"feito_em"?: string,"feito_por"?: string | null,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_checkin_feito_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: true
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_checkin_feito_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
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
                },"estadias_horas_hist": {
                  Row: {
                    "entrada_antes": string | null,"entrada_depois": string | null,"estadia_id": string,"feito_em": string,"feito_por": string | null,"id": string,"motivo": string,"petshop_id": string,"saida_antes": string | null,"saida_depois": string | null,"taxa": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entrada_antes"?: string | null,"entrada_depois"?: string | null,"estadia_id": string,"feito_em"?: string,"feito_por"?: string | null,"id"?: string,"motivo"?: string,"petshop_id": string,"saida_antes"?: string | null,"saida_depois"?: string | null,"taxa"?: string
                  }
                  Update: {
                    "entrada_antes"?: string | null,"entrada_depois"?: string | null,"estadia_id"?: string,"feito_em"?: string,"feito_por"?: string | null,"id"?: string,"motivo"?: string,"petshop_id"?: string,"saida_antes"?: string | null,"saida_depois"?: string | null,"taxa"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "estadias_horas_hist_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estadias_horas_hist_petshop_id_fkey"
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
                },"exclusoes_conta": {
                  Row: {
                    "apagado_em": string | null,"apagar_em": string,"cancelado_em": string | null,"cancelado_por": string | null,"id": number,"pedido_em": string,"pedido_email": string | null,"pedido_nome": string | null,"pedido_por": string | null,"petshop_id": string,"petshop_nome": string,"usuarios": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "apagado_em"?: string | null,"apagar_em": string,"cancelado_em"?: string | null,"cancelado_por"?: string | null,"id"?: never,"pedido_em"?: string,"pedido_email"?: string | null,"pedido_nome"?: string | null,"pedido_por"?: string | null,"petshop_id": string,"petshop_nome": string,"usuarios"?: number | null
                  }
                  Update: {
                    "apagado_em"?: string | null,"apagar_em"?: string,"cancelado_em"?: string | null,"cancelado_por"?: string | null,"id"?: never,"pedido_em"?: string,"pedido_email"?: string | null,"pedido_nome"?: string | null,"pedido_por"?: string | null,"petshop_id"?: string,"petshop_nome"?: string,"usuarios"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"fiado_liberacoes": {
                  Row: {
                    "cliente_id": string,"criado_em": string,"devia": number,"id": string,"lancamento_id": string | null,"liberado_nome": string | null,"liberado_por": string | null,"limite": number,"petshop_id": string,"usado_em": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"criado_em"?: string,"devia": number,"id"?: string,"lancamento_id"?: string | null,"liberado_nome"?: string | null,"liberado_por"?: string | null,"limite": number,"petshop_id": string,"usado_em"?: string | null,"valor": number
                  }
                  Update: {
                    "cliente_id"?: string,"criado_em"?: string,"devia"?: number,"id"?: string,"lancamento_id"?: string | null,"liberado_nome"?: string | null,"liberado_por"?: string | null,"limite"?: number,"petshop_id"?: string,"usado_em"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fiado_liberacoes_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "fiado_liberacoes_petshop_id_fkey"
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
                },"fotos_autorizacao_freio": {
                  Row: {
                    "chave": string,"minuto": string,"n": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"minuto": string,"n"?: number
                  }
                  Update: {
                    "chave"?: string,"minuto"?: string,"n"?: number
                  }
                  Relationships: [
                    
                  ]
                },"fotos_autorizacoes": {
                  Row: {
                    "autorizado_em": string,"boletim_id": string | null,"codigo": string,"escopo": string,"id": string,"ip": string | null,"marcar": string | null,"navegador": string | null,"pet_id": string,"petshop_id": string,"retirado_em": string | null,"retirado_motivo": string | null,"texto": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autorizado_em"?: string,"boletim_id"?: string | null,"codigo": string,"escopo": string,"id"?: string,"ip"?: string | null,"marcar"?: string | null,"navegador"?: string | null,"pet_id": string,"petshop_id": string,"retirado_em"?: string | null,"retirado_motivo"?: string | null,"texto": string
                  }
                  Update: {
                    "autorizado_em"?: string,"boletim_id"?: string | null,"codigo"?: string,"escopo"?: string,"id"?: string,"ip"?: string | null,"marcar"?: string | null,"navegador"?: string | null,"pet_id"?: string,"petshop_id"?: string,"retirado_em"?: string | null,"retirado_motivo"?: string | null,"texto"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fotos_autorizacoes_boletim_id_fkey"
      columns: ["boletim_id"]
isOneToOne: false
      referencedRelation: "boletins"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fotos_autorizacoes_pet_id_petshop_id_fkey"
      columns: ["pet_id","petshop_id"]
isOneToOne: false
      referencedRelation: "pets"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "fotos_autorizacoes_petshop_id_fkey"
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
                    "agendamento_id": string | null,"alterado_em": string | null,"caixa_id": string | null,"categoria": string,"chave": string | null,"cliente_id": string | null,"cobrado_em": string | null,"conta_id": string | null,"credito_usado": number | null,"criado_em": string,"criado_por": string | null,"data": string,"descricao": string | null,"devido_desde": string | null,"diferenca_de": string | null,"forma": string | null,"id": string,"itens": Json | null,"movimento": string | null,"multa_de": string | null,"multa_recebida": number | null,"multa_recebida_em": string | null,"origem": string,"pagamentos": Json | null,"pago": boolean,"pago_em": string | null,"petshop_id": string,"tipo": string,"valor": number,"valor_original": number | null,"vencimento": string | null,"vendido_por": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"alterado_em"?: string | null,"caixa_id"?: string | null,"categoria"?: string,"chave"?: string | null,"cliente_id"?: string | null,"cobrado_em"?: string | null,"conta_id"?: string | null,"credito_usado"?: number | null,"criado_em"?: string,"criado_por"?: string | null,"data"?: string,"descricao"?: string | null,"devido_desde"?: string | null,"diferenca_de"?: string | null,"forma"?: string | null,"id"?: string,"itens"?: Json | null,"movimento"?: string | null,"multa_de"?: string | null,"multa_recebida"?: number | null,"multa_recebida_em"?: string | null,"origem"?: string,"pagamentos"?: Json | null,"pago"?: boolean,"pago_em"?: string | null,"petshop_id": string,"tipo": string,"valor": number,"valor_original"?: number | null,"vencimento"?: string | null,"vendido_por"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string | null,"alterado_em"?: string | null,"caixa_id"?: string | null,"categoria"?: string,"chave"?: string | null,"cliente_id"?: string | null,"cobrado_em"?: string | null,"conta_id"?: string | null,"credito_usado"?: number | null,"criado_em"?: string,"criado_por"?: string | null,"data"?: string,"descricao"?: string | null,"devido_desde"?: string | null,"diferenca_de"?: string | null,"forma"?: string | null,"id"?: string,"itens"?: Json | null,"movimento"?: string | null,"multa_de"?: string | null,"multa_recebida"?: number | null,"multa_recebida_em"?: string | null,"origem"?: string,"pagamentos"?: Json | null,"pago"?: boolean,"pago_em"?: string | null,"petshop_id"?: string,"tipo"?: string,"valor"?: number,"valor_original"?: number | null,"vencimento"?: string | null,"vendido_por"?: string | null
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
      foreignKeyName: "lancamentos_diferenca_de_fkey"
      columns: ["diferenca_de","petshop_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id","petshop_id"]
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
    },{
      foreignKeyName: "lancamentos_vendido_por_fkey"
      columns: ["vendido_por"]
isOneToOne: false
      referencedRelation: "profissionais"
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
                },"lancamentos_recebidos": {
                  Row: {
                    "lancamento_id": string,"petshop_id": string,"recebido_em": string,"recebido_por": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "lancamento_id": string,"petshop_id": string,"recebido_em"?: string,"recebido_por"?: string | null
                  }
                  Update: {
                    "lancamento_id"?: string,"petshop_id"?: string,"recebido_em"?: string,"recebido_por"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamentos_recebidos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: true
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_recebidos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"lancamentos_taxas": {
                  Row: {
                    "atualizado_em": string | null,"cartao": number,"criado_em": string,"lancamento_id": string,"parcelas": number | null,"partes": NonNullable<Json>,"petshop_id": string,"regra": NonNullable<Json>,"taxa": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string | null,"cartao"?: number,"criado_em"?: string,"lancamento_id": string,"parcelas"?: number | null,"partes"?: NonNullable<Json>,"petshop_id": string,"regra": NonNullable<Json>,"taxa"?: number
                  }
                  Update: {
                    "atualizado_em"?: string | null,"cartao"?: number,"criado_em"?: string,"lancamento_id"?: string,"parcelas"?: number | null,"partes"?: NonNullable<Json>,"petshop_id"?: string,"regra"?: NonNullable<Json>,"taxa"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lancamentos_taxas_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: true
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lancamentos_taxas_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"leva_traz_estadias": {
                  Row: {
                    "estadia_id": string,"feito_em": string,"feito_por": string | null,"perna": string,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "estadia_id": string,"feito_em"?: string,"feito_por"?: string | null,"perna": string,"petshop_id": string
                  }
                  Update: {
                    "estadia_id"?: string,"feito_em"?: string,"feito_por"?: string | null,"perna"?: string,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leva_traz_estadias_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leva_traz_estadias_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"leva_traz_viagens": {
                  Row: {
                    "agendamento_id": string,"feito_em": string,"feito_por": string | null,"perna": string,"petshop_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id": string,"feito_em"?: string,"feito_por"?: string | null,"perna": string,"petshop_id": string
                  }
                  Update: {
                    "agendamento_id"?: string,"feito_em"?: string,"feito_por"?: string | null,"perna"?: string,"petshop_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leva_traz_viagens_agendamento_id_petshop_id_fkey"
      columns: ["agendamento_id","petshop_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "leva_traz_viagens_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"lgpd_registros": {
                  Row: {
                    "acao": string,"detalhe": NonNullable<Json>,"id": number,"petshop_id": string | null,"quando": string,"quem": string | null,"quem_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"detalhe"?: NonNullable<Json>,"id"?: never,"petshop_id"?: string | null,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null
                  }
                  Update: {
                    "acao"?: string,"detalhe"?: NonNullable<Json>,"id"?: never,"petshop_id"?: string | null,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"link_envios": {
                  Row: {
                    "em": string,"fone": string | null,"id": number,"pedido_id": string | null,"petshop_id": string,"rede": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "em"?: string,"fone"?: string | null,"id"?: never,"pedido_id"?: string | null,"petshop_id": string,"rede"?: string | null,"tipo": string
                  }
                  Update: {
                    "em"?: string,"fone"?: string | null,"id"?: never,"pedido_id"?: string | null,"petshop_id"?: string,"rede"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "link_envios_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"link_ia_uso": {
                  Row: {
                    "dia": string,"perguntas": number,"petshop_id": string,"respondidas": number,"sem_resposta": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dia": string,"perguntas"?: number,"petshop_id": string,"respondidas"?: number,"sem_resposta"?: number
                  }
                  Update: {
                    "dia"?: string,"perguntas"?: number,"petshop_id"?: string,"respondidas"?: number,"sem_resposta"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "link_ia_uso_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"lista_espera": {
                  Row: {
                    "chamado_em": string | null,"criado_em": string,"criado_nome": string | null,"criado_por": string | null,"entrada": string,"especie": string | null,"hora_entrada": string | null,"hora_saida": string | null,"id": string,"obs": string | null,"origem": string,"pet_id": string | null,"pet_nome": string,"petshop_id": string,"porte": string | null,"saida": string,"status": string,"telefone": string | null,"termos_aceitos_em": string | null,"tipo": string,"tutor_nome": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chamado_em"?: string | null,"criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"entrada": string,"especie"?: string | null,"hora_entrada"?: string | null,"hora_saida"?: string | null,"id"?: string,"obs"?: string | null,"origem"?: string,"pet_id"?: string | null,"pet_nome": string,"petshop_id": string,"porte"?: string | null,"saida": string,"status"?: string,"telefone"?: string | null,"termos_aceitos_em"?: string | null,"tipo": string,"tutor_nome"?: string | null
                  }
                  Update: {
                    "chamado_em"?: string | null,"criado_em"?: string,"criado_nome"?: string | null,"criado_por"?: string | null,"entrada"?: string,"especie"?: string | null,"hora_entrada"?: string | null,"hora_saida"?: string | null,"id"?: string,"obs"?: string | null,"origem"?: string,"pet_id"?: string | null,"pet_nome"?: string,"petshop_id"?: string,"porte"?: string | null,"saida"?: string,"status"?: string,"telefone"?: string | null,"termos_aceitos_em"?: string | null,"tipo"?: string,"tutor_nome"?: string | null
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
                },"mensagens_enviadas": {
                  Row: {
                    "dia": string,"enviado_em": string,"enviado_por": string | null,"id": string,"petshop_id": string,"ref": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "dia": string,"enviado_em"?: string,"enviado_por"?: string | null,"id"?: string,"petshop_id": string,"ref": string,"tipo": string
                  }
                  Update: {
                    "dia"?: string,"enviado_em"?: string,"enviado_por"?: string | null,"id"?: string,"petshop_id"?: string,"ref"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensagens_enviadas_enviado_por_fkey"
      columns: ["enviado_por"]
isOneToOne: false
      referencedRelation: "profissionais"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensagens_enviadas_petshop_id_fkey"
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
                    "chave": string | null,"criado_em": string,"criado_por": string | null,"custo_unitario": number | null,"estadia_id": string | null,"fornecedor_id": string | null,"id": string,"kit_movimento_id": string | null,"lancamento_id": string | null,"lote": string | null,"lote_id": string | null,"motivo": string | null,"origem": string,"petshop_id": string,"produto_id": string,"quantidade": number,"tipo": string,"validade": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "chave"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"custo_unitario"?: number | null,"estadia_id"?: string | null,"fornecedor_id"?: string | null,"id"?: string,"kit_movimento_id"?: string | null,"lancamento_id"?: string | null,"lote"?: string | null,"lote_id"?: string | null,"motivo"?: string | null,"origem"?: string,"petshop_id": string,"produto_id": string,"quantidade": number,"tipo": string,"validade"?: string | null
                  }
                  Update: {
                    "chave"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"custo_unitario"?: number | null,"estadia_id"?: string | null,"fornecedor_id"?: string | null,"id"?: string,"kit_movimento_id"?: string | null,"lancamento_id"?: string | null,"lote"?: string | null,"lote_id"?: string | null,"motivo"?: string | null,"origem"?: string,"petshop_id"?: string,"produto_id"?: string,"quantidade"?: number,"tipo"?: string,"validade"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimentos_estoque_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentos_estoque_fornecedor_fkey"
      columns: ["fornecedor_id","petshop_id"]
isOneToOne: false
      referencedRelation: "fornecedores"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "movimentos_estoque_kit_movimento_id_fkey"
      columns: ["kit_movimento_id"]
isOneToOne: false
      referencedRelation: "movimentos_estoque"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentos_estoque_lote_id_fkey"
      columns: ["lote_id"]
isOneToOne: false
      referencedRelation: "produtos_lotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentos_estoque_produto_id_petshop_id_fkey"
      columns: ["produto_id","petshop_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id","petshop_id"]
    }
                  ]
                },"movimentos_lotes": {
                  Row: {
                    "criado_em": string,"id": string,"lote_id": string,"movimento_id": string,"petshop_id": string,"quantidade": number
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"id"?: string,"lote_id": string,"movimento_id": string,"petshop_id": string,"quantidade": number
                  }
                  Update: {
                    "criado_em"?: string,"id"?: string,"lote_id"?: string,"movimento_id"?: string,"petshop_id"?: string,"quantidade"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "movimentos_lotes_lote_id_fkey"
      columns: ["lote_id"]
isOneToOne: false
      referencedRelation: "produtos_lotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentos_lotes_movimento_id_fkey"
      columns: ["movimento_id"]
isOneToOne: false
      referencedRelation: "movimentos_estoque"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movimentos_lotes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
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
                },"orcamento_acessos": {
                  Row: {
                    "minuto": string,"n": number,"orcamento_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "minuto": string,"n"?: number,"orcamento_id": string
                  }
                  Update: {
                    "minuto"?: string,"n"?: number,"orcamento_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_acessos_orcamento_id_fkey"
      columns: ["orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamentos"
      referencedColumns: ["id"]
    }
                  ]
                },"orcamentos": {
                  Row: {
                    "aceito_em": string | null,"agendamento_id": string | null,"alterado_em": string | null,"chave": string | null,"cliente_id": string | null,"convertido_em": string | null,"convertido_por": string | null,"criado_em": string,"criado_por": string | null,"desconto": number,"id": string,"itens": NonNullable<Json>,"lancamento_id": string | null,"nome": string | null,"numero": number,"obs": string | null,"petshop_id": string,"status": string,"subtotal": number,"telefone": string | null,"token": string,"total": number,"validade": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aceito_em"?: string | null,"agendamento_id"?: string | null,"alterado_em"?: string | null,"chave"?: string | null,"cliente_id"?: string | null,"convertido_em"?: string | null,"convertido_por"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"desconto"?: number,"id"?: string,"itens": NonNullable<Json>,"lancamento_id"?: string | null,"nome"?: string | null,"numero": number,"obs"?: string | null,"petshop_id": string,"status"?: string,"subtotal"?: number,"telefone"?: string | null,"token": string,"total"?: number,"validade": string
                  }
                  Update: {
                    "aceito_em"?: string | null,"agendamento_id"?: string | null,"alterado_em"?: string | null,"chave"?: string | null,"cliente_id"?: string | null,"convertido_em"?: string | null,"convertido_por"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"desconto"?: number,"id"?: string,"itens"?: NonNullable<Json>,"lancamento_id"?: string | null,"nome"?: string | null,"numero"?: number,"obs"?: string | null,"petshop_id"?: string,"status"?: string,"subtotal"?: number,"telefone"?: string | null,"token"?: string,"total"?: number,"validade"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamentos_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_cliente_id_petshop_id_fkey"
      columns: ["cliente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "orcamentos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamentos_petshop_id_fkey"
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
                    "acabou_em": string | null,"ativo": boolean,"chave": string | null,"comprado_em": string,"criado_em": string,"id": string,"nome": string,"pacote_id": string | null,"pet_id": string,"petshop_id": string,"preco": number,"servico_id": string | null,"total": number,"usados": number,"vence_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acabou_em"?: string | null,"ativo"?: boolean,"chave"?: string | null,"comprado_em"?: string,"criado_em"?: string,"id"?: string,"nome": string,"pacote_id"?: string | null,"pet_id": string,"petshop_id": string,"preco"?: number,"servico_id"?: string | null,"total": number,"usados"?: number,"vence_em"?: string | null
                  }
                  Update: {
                    "acabou_em"?: string | null,"ativo"?: boolean,"chave"?: string | null,"comprado_em"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"pacote_id"?: string | null,"pet_id"?: string,"petshop_id"?: string,"preco"?: number,"servico_id"?: string | null,"total"?: number,"usados"?: number,"vence_em"?: string | null
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
                    "agendamento_id": string | null,"avisado_em": string | null,"cliente_cancelou_em": string | null,"cliente_pedido_visto_em": string | null,"cliente_pediu": string | null,"cliente_pediu_em": string | null,"cliente_recado": string | null,"criado_em": string,"especie": string,"estadia_id": string | null,"experiencia": boolean,"fim": string,"grupo_id": string | null,"id": string,"inicio": string,"obs": string | null,"pet_nome": string,"petshop_id": string,"porte": string | null,"promo": Json | null,"servico_id": string | null,"status": string,"telefone": string,"termos_aceitos_em": string | null,"termos_texto": string | null,"termos_vacinas": boolean | null,"tipo": string,"tutor_nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"avisado_em"?: string | null,"cliente_cancelou_em"?: string | null,"cliente_pedido_visto_em"?: string | null,"cliente_pediu"?: string | null,"cliente_pediu_em"?: string | null,"cliente_recado"?: string | null,"criado_em"?: string,"especie"?: string,"estadia_id"?: string | null,"experiencia"?: boolean,"fim": string,"grupo_id"?: string | null,"id"?: string,"inicio": string,"obs"?: string | null,"pet_nome": string,"petshop_id": string,"porte"?: string | null,"promo"?: Json | null,"servico_id"?: string | null,"status"?: string,"telefone": string,"termos_aceitos_em"?: string | null,"termos_texto"?: string | null,"termos_vacinas"?: boolean | null,"tipo"?: string,"tutor_nome": string
                  }
                  Update: {
                    "agendamento_id"?: string | null,"avisado_em"?: string | null,"cliente_cancelou_em"?: string | null,"cliente_pedido_visto_em"?: string | null,"cliente_pediu"?: string | null,"cliente_pediu_em"?: string | null,"cliente_recado"?: string | null,"criado_em"?: string,"especie"?: string,"estadia_id"?: string | null,"experiencia"?: boolean,"fim"?: string,"grupo_id"?: string | null,"id"?: string,"inicio"?: string,"obs"?: string | null,"pet_nome"?: string,"petshop_id"?: string,"porte"?: string | null,"promo"?: Json | null,"servico_id"?: string | null,"status"?: string,"telefone"?: string,"termos_aceitos_em"?: string | null,"termos_texto"?: string | null,"termos_vacinas"?: boolean | null,"tipo"?: string,"tutor_nome"?: string
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
                },"petshop_status_hist": {
                  Row: {
                    "de": Database["public"]['Enums']["status_assinatura"] | null,"em": string,"id": number,"para": Database["public"]['Enums']["status_assinatura"],"petshop_id": string,"plano": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "de"?: Database["public"]['Enums']["status_assinatura"] | null,"em"?: string,"id"?: never,"para": Database["public"]['Enums']["status_assinatura"],"petshop_id": string,"plano"?: string | null
                  }
                  Update: {
                    "de"?: Database["public"]['Enums']["status_assinatura"] | null,"em"?: string,"id"?: never,"para"?: Database["public"]['Enums']["status_assinatura"],"petshop_id"?: string,"plano"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "petshop_status_hist_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
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
                    "abaixo_do_custo": boolean,"agendamento_id": string | null,"de": number | null,"id": string,"item": string,"lancamento_id": string | null,"movimento_id": string | null,"pacote_cliente_id": string | null,"para": number,"petshop_id": string,"qtd": number | null,"quando": string,"quem": string | null,"quem_nome": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "abaixo_do_custo"?: boolean,"agendamento_id"?: string | null,"de"?: number | null,"id"?: string,"item": string,"lancamento_id"?: string | null,"movimento_id"?: string | null,"pacote_cliente_id"?: string | null,"para": number,"petshop_id": string,"qtd"?: number | null,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null,"tipo": string
                  }
                  Update: {
                    "abaixo_do_custo"?: boolean,"agendamento_id"?: string | null,"de"?: number | null,"id"?: string,"item"?: string,"lancamento_id"?: string | null,"movimento_id"?: string | null,"pacote_cliente_id"?: string | null,"para"?: number,"petshop_id"?: string,"qtd"?: number | null,"quando"?: string,"quem"?: string | null,"quem_nome"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "precos_alterados_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
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
                    "ativo": boolean,"categoria": string | null,"codigo_barras": string | null,"controla_validade": boolean,"criado_em": string,"custo": number | null,"embalagem_qtd": number | null,"estoque": number,"estoque_minimo": number,"fornecedor_id": string | null,"id": string,"nome": string,"petshop_id": string,"preco_venda": number | null,"tipo": string,"ultimo_custo": number | null,"unidade": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"categoria"?: string | null,"codigo_barras"?: string | null,"controla_validade"?: boolean,"criado_em"?: string,"custo"?: number | null,"embalagem_qtd"?: number | null,"estoque"?: number,"estoque_minimo"?: number,"fornecedor_id"?: string | null,"id"?: string,"nome": string,"petshop_id": string,"preco_venda"?: number | null,"tipo"?: string,"ultimo_custo"?: number | null,"unidade"?: string
                  }
                  Update: {
                    "ativo"?: boolean,"categoria"?: string | null,"codigo_barras"?: string | null,"controla_validade"?: boolean,"criado_em"?: string,"custo"?: number | null,"embalagem_qtd"?: number | null,"estoque"?: number,"estoque_minimo"?: number,"fornecedor_id"?: string | null,"id"?: string,"nome"?: string,"petshop_id"?: string,"preco_venda"?: number | null,"tipo"?: string,"ultimo_custo"?: number | null,"unidade"?: string
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
                },"produtos_kit_itens": {
                  Row: {
                    "componente_id": string,"kit_id": string,"petshop_id": string,"quantidade": number
                  }
                  ComputedFields: never
                  Insert: {
                    "componente_id": string,"kit_id": string,"petshop_id": string,"quantidade": number
                  }
                  Update: {
                    "componente_id"?: string,"kit_id"?: string,"petshop_id"?: string,"quantidade"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "produtos_kit_itens_componente_id_petshop_id_fkey"
      columns: ["componente_id","petshop_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "produtos_kit_itens_kit_id_petshop_id_fkey"
      columns: ["kit_id","petshop_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "produtos_kit_itens_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"produtos_lotes": {
                  Row: {
                    "criado_em": string,"custo_unitario": number | null,"id": string,"lote": string | null,"petshop_id": string,"produto_id": string,"quantidade": number,"validade": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"custo_unitario"?: number | null,"id"?: string,"lote"?: string | null,"petshop_id": string,"produto_id": string,"quantidade"?: number,"validade"?: string | null
                  }
                  Update: {
                    "criado_em"?: string,"custo_unitario"?: number | null,"id"?: string,"lote"?: string | null,"petshop_id"?: string,"produto_id"?: string,"quantidade"?: number,"validade"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "produtos_lotes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_lotes_produto_id_petshop_id_fkey"
      columns: ["produto_id","petshop_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["id","petshop_id"]
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
                },"promo_usos": {
                  Row: {
                    "agendamento_id": string | null,"criado_em": string,"desconto": number,"estadia_id": string | null,"id": number,"lancamento_id": string | null,"petshop_id": string,"promo_id": string | null,"promo_nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id"?: string | null,"criado_em"?: string,"desconto": number,"estadia_id"?: string | null,"id"?: never,"lancamento_id"?: string | null,"petshop_id": string,"promo_id"?: string | null,"promo_nome": string
                  }
                  Update: {
                    "agendamento_id"?: string | null,"criado_em"?: string,"desconto"?: number,"estadia_id"?: string | null,"id"?: never,"lancamento_id"?: string | null,"petshop_id"?: string,"promo_id"?: string | null,"promo_nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_usos_agendamento_id_fkey"
      columns: ["agendamento_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_usos_estadia_id_fkey"
      columns: ["estadia_id"]
isOneToOne: false
      referencedRelation: "estadias"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_usos_lancamento_id_fkey"
      columns: ["lancamento_id"]
isOneToOne: false
      referencedRelation: "lancamentos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_usos_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"promocoes": {
                  Row: {
                    "ativa": boolean,"atualizado_em": string,"banho_tosa": boolean,"casa": (string)[],"comeca_em": string | null,"criado_em": string,"criado_por": string | null,"dias": (number)[],"hora_ate": string | null,"hora_de": string | null,"id": string,"nome": string,"petshop_id": string,"servicos": (string)[],"termina_em": string | null,"tipo": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"atualizado_em"?: string,"banho_tosa"?: boolean,"casa"?: (string)[],"comeca_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"dias": (number)[],"hora_ate"?: string | null,"hora_de"?: string | null,"id"?: string,"nome": string,"petshop_id": string,"servicos"?: (string)[],"termina_em"?: string | null,"tipo": string,"valor": number
                  }
                  Update: {
                    "ativa"?: boolean,"atualizado_em"?: string,"banho_tosa"?: boolean,"casa"?: (string)[],"comeca_em"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"dias"?: (number)[],"hora_ate"?: string | null,"hora_de"?: string | null,"id"?: string,"nome"?: string,"petshop_id"?: string,"servicos"?: (string)[],"termina_em"?: string | null,"tipo"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "promocoes_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"quadro_atendimento": {
                  Row: {
                    "agendamento_id": string,"atualizado_em": string,"atualizado_por": string | null,"chegou_em": string | null,"entregue_em": string | null,"etapa": string | null,"etapa_em": string | null,"petshop_id": string,"status_antes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agendamento_id": string,"atualizado_em"?: string,"atualizado_por"?: string | null,"chegou_em"?: string | null,"entregue_em"?: string | null,"etapa"?: string | null,"etapa_em"?: string | null,"petshop_id": string,"status_antes"?: string | null
                  }
                  Update: {
                    "agendamento_id"?: string,"atualizado_em"?: string,"atualizado_por"?: string | null,"chegou_em"?: string | null,"entregue_em"?: string | null,"etapa"?: string | null,"etapa_em"?: string | null,"petshop_id"?: string,"status_antes"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quadro_atendimento_agendamento_id_petshop_id_fkey"
      columns: ["agendamento_id","petshop_id"]
isOneToOne: false
      referencedRelation: "agendamentos"
      referencedColumns: ["id","petshop_id"]
    },{
      foreignKeyName: "quadro_atendimento_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: false
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"registros_acesso": {
                  Row: {
                    "em": string,"id": number,"ip": string | null,"navegador": string | null,"origem": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "em"?: string,"id"?: never,"ip"?: string | null,"navegador"?: string | null,"origem": string,"user_id": string
                  }
                  Update: {
                    "em"?: string,"id"?: never,"ip"?: string | null,"navegador"?: string | null,"origem"?: string,"user_id"?: string
                  }
                  Relationships: [
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
                    "ativo": boolean,"categoria": string,"cor": string,"criado_em": string,"custo_material": number | null,"duracao_min": number,"id": string,"nome": string,"ordem": number,"petshop_id": string,"preco_g": number | null,"preco_gg": number | null,"preco_m": number | null,"preco_p": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"categoria"?: string,"cor"?: string,"criado_em"?: string,"custo_material"?: number | null,"duracao_min"?: number,"id"?: string,"nome": string,"ordem"?: number,"petshop_id": string,"preco_g"?: number | null,"preco_gg"?: number | null,"preco_m"?: number | null,"preco_p"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean,"categoria"?: string,"cor"?: string,"criado_em"?: string,"custo_material"?: number | null,"duracao_min"?: number,"id"?: string,"nome"?: string,"ordem"?: number,"petshop_id"?: string,"preco_g"?: number | null,"preco_gg"?: number | null,"preco_m"?: number | null,"preco_p"?: number | null
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
                },"taxas_maquininha": {
                  Row: {
                    "atualizado_em": string,"atualizado_por": string | null,"credito_dias": number,"credito_fixo": number,"credito_pct": number,"debito_dias": number,"debito_fixo": number,"debito_pct": number,"parcelado_dias": number | null,"parcelado_pct": number | null,"parcelas_pct": NonNullable<Json>,"petshop_id": string,"pix_dias": number,"pix_fixo": number,"pix_pct": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"atualizado_por"?: string | null,"credito_dias"?: number,"credito_fixo"?: number,"credito_pct"?: number,"debito_dias"?: number,"debito_fixo"?: number,"debito_pct"?: number,"parcelado_dias"?: number | null,"parcelado_pct"?: number | null,"parcelas_pct"?: NonNullable<Json>,"petshop_id": string,"pix_dias"?: number,"pix_fixo"?: number,"pix_pct"?: number
                  }
                  Update: {
                    "atualizado_em"?: string,"atualizado_por"?: string | null,"credito_dias"?: number,"credito_fixo"?: number,"credito_pct"?: number,"debito_dias"?: number,"debito_fixo"?: number,"debito_pct"?: number,"parcelado_dias"?: number | null,"parcelado_pct"?: number | null,"parcelas_pct"?: NonNullable<Json>,"petshop_id"?: string,"pix_dias"?: number,"pix_fixo"?: number,"pix_pct"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxas_maquininha_petshop_id_fkey"
      columns: ["petshop_id"]
isOneToOne: true
      referencedRelation: "petshops"
      referencedColumns: ["id"]
    }
                  ]
                },"tutor_acessos": {
                  Row: {
                    "cliente_id": string,"minuto": string,"n": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"minuto": string,"n"?: number,"tipo": string
                  }
                  Update: {
                    "cliente_id"?: string,"minuto"?: string,"n"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tutor_acessos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"tutor_links": {
                  Row: {
                    "cliente_id": string,"criado_em": string,"criado_por": string | null,"petshop_id": string,"token": string,"visto_em": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"criado_em"?: string,"criado_por"?: string | null,"petshop_id": string,"token": string,"visto_em"?: string | null
                  }
                  Update: {
                    "cliente_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"petshop_id"?: string,"token"?: string,"visto_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tutor_links_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: true
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tutor_links_petshop_id_fkey"
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
                },"vendas_uso": {
                  Row: {
                    "hora": string,"mensagens": number,"visitante": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hora": string,"mensagens"?: number,"visitante": string
                  }
                  Update: {
                    "hora"?: string,"mensagens"?: number,"visitante"?: string
                  }
                  Relationships: [
                    
                  ]
                },"webhook_vistos": {
                  Row: {
                    "chave": string,"visto_em": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"visto_em"?: string
                  }
                  Update: {
                    "chave"?: string,"visto_em"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "aceitar_documentos":
{ Args: { "p_privacidade": string,"p_termos": string }; Returns: Json
                           },
"acesso_liberado":
{ Args: { "p": string }; Returns: boolean
                           },
"admin_aceites":
{ Args: { "p_busca"?: string,"p_limite"?: number }; Returns: Json
                           },
"admin_registros_acesso":
{ Args: { "p_email"?: string,"p_limite"?: number,"p_user"?: string }; Returns: Json
                           },
"admin_atualizar":
{ Args: { "p_nota"?: string,"p_petshop": string,"p_plano"?: string,"p_status"?: Database["public"]['Enums']["status_assinatura"],"p_teste_ate"?: string }; Returns: undefined
                           },
"admin_cakto":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_cakto_abrir":
{ Args: { "p_aberta": boolean }; Returns: undefined
                           },
"admin_cakto_descartar":
{ Args: { "p_evento": number }; Returns: undefined
                           },
"admin_cakto_ligar":
{ Args: { "p_evento": number,"p_petshop": string }; Returns: number
                           },
"admin_cakto_oferta":
{ Args: { "p_link": string,"p_meses": number,"p_oferta": string,"p_plano": string }; Returns: undefined
                           },
"admin_cakto_produto":
{ Args: { "p_produto": string }; Returns: undefined
                           },
"admin_cakto_segredo":
{ Args: { "p_qual": string,"p_segredo": string }; Returns: undefined
                           },
"admin_cakto_sem_conta":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_conta":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"admin_conversas":
{ Args: { "p_canal"?: string,"p_limite"?: number,"p_petshop"?: string }; Returns: Json
                           },
"admin_copias":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_empresa_marcar":
{ Args: { "p_feito": boolean,"p_passo": string }; Returns: Json
                           },
"admin_erro_resolver":
{ Args: { "p_assinatura": string,"p_resolvido"?: boolean }; Returns: undefined
                           },
"admin_erros":
{ Args: { "p_horas"?: number,"p_resolvidos"?: boolean }; Returns: Json
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
"admin_exclusoes":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_pagantes":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_painel":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_servidor_estado":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_servidor_segredo":
{ Args: { "p_segredo": string }; Returns: undefined
                           },
"admin_status_em":
{ Args: { "p_petshop": string,"p_quando": string }; Returns: Database["public"]['Enums']["status_assinatura"]
                           },
"admin_uso":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_uso_contas":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_visao_geral":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"agendamento_fechar_conta":
{ Args: { "p_agendamento": string,"p_chave": string,"p_passos": Json,"p_petshop": string }; Returns: Json
                           },
"agendamento_preco_da_tabela":
{ Args: { "p_id": string }; Returns: boolean
                           },
"agendamento_promo_usar":
{ Args: { "p_id": string,"p_usar": boolean }; Returns: Json
                           },
"agendamento_remarcado_em":
{ Args: { "p_id": string }; Returns: string
                           },
"agendamento_servicos_definir":
{ Args: { "p_agendamento": string,"p_servicos": Json }; Returns: number
                           },
"agendamentos_para_cobrar":
{ Args: { "p": string,"p_ate"?: string,"p_de"?: string }; Returns: {
              "id": string,"inicio": string
            }[]
                           },
"agendamentos_precos":
{ Args: { "p": string,"p_ids": (string)[] }; Returns: {
              "agendamento_id": string,"id": string,"preco": number
            }[]
                           },
"album_criar":
{ Args: { "p_fotos": Json,"p_pet": string,"p_petshop": string }; Returns: Json
                           },
"album_do_codigo":
{ Args: { "p_token": string }; Returns: {
              "criado_em": string,
"criado_por": string | null,
"expira_em": string,
"id": string,
"itens": NonNullable<Json>,
"pet_id": string,
"petshop_id": string,
"token": string
            }
                          SetofOptions: {
        from: "*"
        to: "albuns"
        isOneToOne: true
        isSetofReturn: false
      } },
"album_foto":
{ Args: { "p_n": number,"p_token": string }; Returns: Json
                           },
"album_publico":
{ Args: { "p_token": string }; Returns: Json
                           },
"alteracoes_de_valores":
{ Args: { "p": string,"p_todas"?: boolean }; Returns: {
              "abaixo_do_custo": boolean,"de": number,"descricao": string,"id": string,"nova": boolean,"para": number,"quando": string,"quem_nome": string,"tipo": string
            }[]
                           },
"alteracoes_do_periodo":
{ Args: { "p": string,"p_ate": string,"p_desde": string,"p_minhas"?: boolean }; Returns: {
              "abaixo_do_custo": boolean,"de": number,"descricao": string,"id": string,"lancamento_id": string,"minha": boolean,"para": number,"quando": string,"quem_nome": string,"tipo": string
            }[]
                           },
"alteracoes_marcar_vistas":
{ Args: { "p": string }; Returns: undefined
                           },
"assinatura_callback":
{ Args: { "p": string }; Returns: string
                           },
"assistente_contar":
{ Args: { "p_canal": string,"p_limite": number,"p_petshop": string,"p_tipo": string }; Returns: boolean
                           },
"avaliar_conversa":
{ Args: { "p_id": string,"p_pediu_equipe"?: boolean,"p_resolveu"?: boolean }; Returns: undefined
                           },
"boletim_apagar_foto":
{ Args: { "p_boletim": string,"p_caminho": string }; Returns: string
                           },
"boletim_autorizacao":
{ Args: { "p_token": string }; Returns: Json
                           },
"boletim_autorizar":
{ Args: { "p_escopo": string,"p_marcar": string,"p_token": string }; Returns: Json
                           },
"boletim_do_codigo":
{ Args: { "p_token": string }; Returns: {
              "agendamento_id": string | null,
"assinaturas": (string)[],
"atencao": string | null,
"atualizado_em": string,
"chips": NonNullable<Json>,
"criado_em": string,
"criado_por": string | null,
"enviado_em": string | null,
"estadia_id": string | null,
"expira_em": string,
"fotos": (string)[],
"id": string,
"nota": string | null,
"pet_id": string,
"petshop_id": string,
"texto": string,
"token": string
            }
                          SetofOptions: {
        from: "*"
        to: "boletins"
        isOneToOne: true
        isSetofReturn: false
      } },
"boletim_enviado":
{ Args: { "p_id": string }; Returns: string
                           },
"boletim_faxina":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"boletim_faxina_geral":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"boletim_foto":
{ Args: { "p_n": number,"p_token": string }; Returns: Json
                           },
"boletim_foto_em_uso":
{ Args: { "p_nome": string }; Returns: boolean
                           },
"boletim_frear":
{ Args: { "p_boletim": string,"p_limite": number,"p_tipo": string }; Returns: undefined
                           },
"boletim_frear_album":
{ Args: { "p_album": string,"p_limite": number,"p_tipo": string }; Returns: undefined
                           },
"boletim_ia_contar":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"boletim_pode_limpar":
{ Args: { "p_nome": string }; Returns: boolean
                           },
"boletim_publico":
{ Args: { "p_token": string }; Returns: Json
                           },
"boletim_salvar":
{ Args: { "p_agendamento": string,"p_atencao": string,"p_chips": Json,"p_estadia": string,"p_fotos": Json,"p_id": string,"p_nota": string,"p_pet": string,"p_petshop": string,"p_texto": string }; Returns: Json
                           },
"caderno_contar":
{ Args: { "p_paginas": number,"p_petshop": string }; Returns: Json
                           },
"caderno_devolver":
{ Args: { "p_reserva": string }; Returns: Json
                           },
"caderno_reservar":
{ Args: { "p_paginas": number,"p_petshop": string }; Returns: Json
                           },
"caixa_alteracoes":
{ Args: { "p_caixa": string }; Returns: number
                           },
"caixa_esperado":
{ Args: { "p_caixa": string }; Returns: number
                           },
"cakto_aplicar":
{ Args: { "p_assinatura": string,"p_email": string,"p_evento": string,"p_oferta": string,"p_petshop": string,"p_quando"?: string }; Returns: string
                           },
"cakto_evento":
{ Args: { "p_assinatura": string,"p_callback"?: string,"p_email": string,"p_evento": string,"p_oferta"?: string,"p_payload": Json,"p_produto"?: string,"p_produto_curto"?: string,"p_segredo": string }; Returns: string
                           },
"cakto_segredo_ok":
{ Args: { "p_segredo": string }; Returns: boolean
                           },
"casa_quem_escreve":
{ Args: { "p_petshop": string }; Returns: string
                           },
"cliente_anonimizar":
{ Args: { "p_cliente": string,"p_confirmacao": string }; Returns: Json
                           },
"cliente_dados":
{ Args: { "p_cliente": string }; Returns: Json
                           },
"cliente_receber_contas":
{ Args: { "p_chave": string,"p_cliente": string,"p_passos": Json,"p_petshop": string }; Returns: Json
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
"comissao_extrato":
{ Args: { "p_ate": string,"p_de": string,"p_petshop": string,"p_profissional"?: string }; Returns: Json
                           },
"comissao_linhas_calc":
{ Args: { "p_ate": string,"p_de": string,"p_petshop": string,"p_profissional"?: string }; Returns: {
              "agendamento_id": string,"base": number,"inicio": string,"pacote": boolean,"pct": number,"profissional_id": string,"servico_id": string,"tipo": string,"valor": number
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
"conferir_valor_baixou":
{ Args: { "p_agendamento"?: string,"p_de": number,"p_item": string,"p_movimento"?: string,"p_para": number,"p_petshop": string,"p_qualquer"?: boolean,"p_recusa"?: string,"p_tipo": string }; Returns: boolean
                           },
"conflitos_agenda":
{ Args: { "p_fim": string,"p_ignorar"?: string,"p_inicio": string,"p_petshop": string,"p_profissional": string }; Returns: {
              "checklist": NonNullable<Json>,
"concluido_servicos": string | null,
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
"promo": Json | null,
"pronto_avisado_em": string | null,
"remarcado_em": string | null,
"sem_cobranca": boolean,
"sem_cobranca_em": string | null,
"sem_cobranca_nome": string | null,
"sem_cobranca_por": string | null,
"serie_id": string | null,
"servico_id": string | null,
"status": Database["public"]['Enums']["status_agendamento"],
"valor_concluido": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "agendamentos"
        isOneToOne: false
        isSetofReturn: true
      } },
"conta_exclusao_cancelar":
{ Args: { "p_petshop": string }; Returns: boolean
                           },
"conta_exclusao_pedir":
{ Args: { "p_nome": string,"p_petshop": string }; Returns: Json
                           },
"conta_exclusao_ver":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"conta_receber_junto":
{ Args: { "p_chave": string,"p_conta": string,"p_passos": Json,"p_petshop": string }; Returns: Json
                           },
"contagem_ajustar":
{ Args: { "p_contagem": string }; Returns: Json
                           },
"contagem_iniciar":
{ Args: { "p_categoria": string,"p_chave": string,"p_fornecedor": string,"p_petshop": string }; Returns: string
                           },
"contagem_ler":
{ Args: { "p_contagem": string }; Returns: Json
                           },
"contagem_marcar":
{ Args: { "p_contagem": string,"p_itens": Json }; Returns: Json
                           },
"contagem_pode":
{ Args: { "p": string }; Returns: undefined
                           },
"contagem_status":
{ Args: { "p_contagem": string,"p_status": string }; Returns: undefined
                           },
"contagens_lista":
{ Args: { "p": string }; Returns: Json
                           },
"copia_coluna_fora":
{ Args: { "p_coluna": string,"p_tabela": string }; Returns: boolean
                           },
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
"creche_cobranca_anotar":
{ Args: { "p_id": string,"p_obs": string }; Returns: undefined
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
"creche_desconto_irmao":
{ Args: { "p_cheio": number,"p_mensal": number,"p_mes": string,"p_plano": string }; Returns: number
                           },
"creche_experiencia_ligada":
{ Args: { "p_petshop": string }; Returns: boolean
                           },
"creche_experiencia_max":
{ Args: { "p_petshop": string }; Returns: number
                           },
"creche_falta_futura":
{ Args: { "p_dia": string,"p_marcar"?: boolean,"p_plano": string }; Returns: Json
                           },
"creche_gerar_cobrancas":
{ Args: { "p_petshop": string }; Returns: number
                           },
"creche_irmao_ligado":
{ Args: { "p_petshop": string }; Returns: boolean
                           },
"creche_irmaos_aplicar":
{ Args: { "p_petshop": string }; Returns: number
                           },
"creche_irmaos_refazer":
{ Args: { "p_cliente": string,"p_forcar"?: boolean,"p_mes"?: string,"p_petshop": string }; Returns: number
                           },
"creche_nome_mes":
{ Args: { "p": string }; Returns: string
                           },
"creche_planos_ocupam":
{ Args: { "p_dia": string,"p_hoje": string,"p_petshop": string }; Returns: number
                           },
"creche_reposicao_cabe":
{ Args: { "p_dia": string,"p_plano": string }; Returns: Record<string, unknown>
                           },
"creche_reposicao_casar":
{ Args: { "p_novo"?: string,"p_plano": string }; Returns: {
              "avisou": boolean,"falta": string,"prazo": string,"reposicao": string
            }[]
                           },
"creche_reposicao_decidir":
{ Args: { "p_decisao": string,"p_estadia": string }; Returns: undefined
                           },
"creche_reposicao_prazo":
{ Args: { "p_falta": string,"p_opcoes": Json }; Returns: string
                           },
"creche_reposicao_saldo":
{ Args: { "p_dia"?: string,"p_plano": string }; Returns: Json
                           },
"creche_reservar_extra":
{ Args: { "p_dia": string,"p_obs"?: string,"p_plano": string }; Returns: string
                           },
"creche_saida_atrasada":
{ Args: { "p_petshop": string,"p_quando": string }; Returns: string
                           },
"creche_saida_extras":
{ Args: { "p_plano": string }; Returns: string
                           },
"creche_sugestao_mensal":
{ Args: { "p_mes": string,"p_plano": string,"p_valor": number }; Returns: number
                           },
"creche_vacinas_vencidas":
{ Args: { "p_hoje": string,"p_pet": string }; Returns: string
                           },
"credito_do_tutor_mover":
{ Args: { "p_chave"?: string,"p_cliente": string,"p_estadia"?: string,"p_motivo"?: string,"p_petshop": string,"p_valor": number }; Returns: Json
                           },
"credito_saldo":
{ Args: { "p_cliente": string,"p_petshop": string }; Returns: number
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
"diario_faxina":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"diario_fotos_assinar":
{ Args: { "p_lista": Json,"p_petshop": string }; Returns: number
                           },
"diario_pasta":
{ Args: { "p_nome": string }; Returns: string
                           },
"diario_pode_limpar":
{ Args: { "p_nome": string }; Returns: boolean
                           },
"diferenca_que_falta":
{ Args: { "p_agendamento": string,"p_sem"?: string }; Returns: number
                           },
"diferencas_do_agendamento":
{ Args: { "p_agendamento": string }; Returns: number
                           },
"diferencas_dos_agendamentos":
{ Args: { "p_ids": (string)[],"p_petshop": string }; Returns: {
              "agendamento_id": string,"valor": number
            }[]
                           },
"em_reais":
{ Args: { "v": number }; Returns: string
                           },
"entrada_aceitar":
{ Args: { "p_ip": string,"p_navegador": string,"p_nome": string,"p_token": string }; Returns: Json
                           },
"entrada_area":
{ Args: { "p_agendamento": string }; Returns: (string)[]
                           },
"entrada_arquivo_em_uso":
{ Args: { "p_nome": string }; Returns: boolean
                           },
"entrada_assinar":
{ Args: { "p_assinatura": string,"p_id": string,"p_nome": string }; Returns: Json
                           },
"entrada_devolver":
{ Args: { "p_devolvido": boolean,"p_id": string }; Returns: string
                           },
"entrada_do_codigo":
{ Args: { "p_token": string }; Returns: {
              "aceite": string | null,
"aceite_assinatura": string | null,
"aceite_ip": string | null,
"aceite_navegador": string | null,
"aceite_nome": string | null,
"aceito_em": string | null,
"agendamento_id": string | null,
"assinaturas": (string)[],
"atualizado_em": string,
"criado_em": string,
"criado_por": string | null,
"cuidados": string | null,
"devolvido_em": string | null,
"devolvido_por": string | null,
"estadia_id": string | null,
"fotos": (string)[],
"id": string,
"idoso_doente": boolean,
"lesoes": (string)[],
"lesoes_obs": string | null,
"link_criado_em": string | null,
"obs": string | null,
"pertences": (string)[],
"pertences_outros": string | null,
"pet_id": string,
"petshop_id": string,
"temperamento": (string)[],
"termo": string,
"token": string | null,
"token_expira": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "entradas"
        isOneToOne: true
        isSetofReturn: false
      } },
"entrada_faxina":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"entrada_foto":
{ Args: { "p_n": number,"p_token": string }; Returns: Json
                           },
"entrada_frear":
{ Args: { "p_entrada": string,"p_limite": number,"p_tipo": string }; Returns: undefined
                           },
"entrada_link":
{ Args: { "p_fotos": Json,"p_id": string }; Returns: Json
                           },
"entrada_pode_limpar":
{ Args: { "p_nome": string }; Returns: boolean
                           },
"entrada_publica":
{ Args: { "p_token": string }; Returns: Json
                           },
"entrada_salvar":
{ Args: { "p_agendamento": string,"p_dados": Json,"p_estadia": string,"p_fotos": Json,"p_id": string,"p_pet": string,"p_petshop": string }; Returns: Json
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
"equipe_do_periodo":
{ Args: { "p_ate": string,"p_de": string,"p_petshop": string }; Returns: Json
                           },
"equipe_reservado":
{ Args: { "p": string }; Returns: {
              "comissao_pct": number,"email_convite": string,"id": string
            }[]
                           },
"equipe_sair":
{ Args: { "p_petshop": string }; Returns: boolean
                           },
"erro_limpar":
{ Args: { "p": string,"p_max": number }; Returns: string
                           },
"erro_registrar":
{ Args: { "p_aparelho"?: string,"p_mensagem": string,"p_navegador"?: string,"p_nome"?: string,"p_origem": string,"p_petshop"?: string,"p_pilha"?: string,"p_rota"?: string,"p_sem_internet"?: boolean,"p_tela"?: string,"p_tipo": string,"p_versao"?: string }; Returns: undefined
                           },
"escola_evento":
{ Args: { "p_email": string,"p_evento": string,"p_pedido"?: string,"p_segredo": string,"p_slug": string }; Returns: string
                           },
"estadia_acertar":
{ Args: { "p_diarias": number,"p_id": string,"p_obs"?: string,"p_valor": number }; Returns: boolean
                           },
"estadia_checkout":
{ Args: { "p_chave": string,"p_estadia": string,"p_passos": Json,"p_petshop": string }; Returns: Json
                           },
"estadia_checkout_conferir":
{ Args: { "p_estadia": string,"p_passos": Json,"p_petshop": string,"p_res": Json }; Returns: undefined
                           },
"estadia_corrigir_horas":
{ Args: { "p_entrada"?: string,"p_estadia": string,"p_motivo"?: string,"p_saida"?: string }; Returns: Json
                           },
"estadia_desfazer_checkin":
{ Args: { "p_estadia": string }; Returns: Json
                           },
"estadia_ocupa":
{ Args: { "p_dia": string,"p_entrada": string,"p_hoje": string,"p_saida": string,"p_status": string,"p_tipo": string }; Returns: boolean
                           },
"estadia_promo_usar":
{ Args: { "p_id": string,"p_usar": boolean }; Returns: Json
                           },
"estadia_sinal":
{ Args: { "p_chave": string,"p_estadia": string,"p_passos": Json,"p_petshop": string }; Returns: Json
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
"estoque_vencendo":
{ Args: { "p": string,"p_dias"?: number }; Returns: Json
                           },
"fechar_caixa":
{ Args: { "p_caixa": string,"p_contado": number,"p_esperado"?: number,"p_obs"?: string }; Returns: Json
                           },
"fiado_deve":
{ Args: { "p_cliente": string,"p_petshop": string }; Returns: number
                           },
"fiado_liberar":
{ Args: { "p_cliente": string,"p_petshop": string,"p_valor": number }; Returns: Json
                           },
"fiado_limite_de":
{ Args: { "p_cliente": string,"p_petshop": string }; Returns: number
                           },
"fiado_situacao":
{ Args: { "p_cliente": string,"p_petshop": string }; Returns: Json
                           },
"fone_plausivel":
{ Args: { "p": string }; Returns: boolean
                           },
"forma_por_extenso":
{ Args: { "j": Json }; Returns: string
                           },
"foto_autorizacao_do_boletim":
{ Args: { "p_boletim": string,"p_pet": string,"p_petshop": string }; Returns: {
              "autorizado_em": string,
"boletim_id": string | null,
"codigo": string,
"escopo": string,
"id": string,
"marcar": string | null,
"pet_id": string,
"petshop_id": string,
"retirado_em": string | null,
"retirado_motivo": string | null,
"texto": string
            }
                          SetofOptions: {
        from: "*"
        to: "fotos_autorizacoes"
        isOneToOne: true
        isSetofReturn: false
      } },
"foto_autorizacao_marcar":
{ Args: { "p": string }; Returns: string
                           },
"foto_autorizacao_publica":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"foto_autorizacao_retirar":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"foto_autorizacao_texto":
{ Args: { "p_dia": string,"p_escopo": string,"p_loja": string,"p_marcar": string,"p_pet": string,"p_sexo": string }; Returns: string
                           },
"fotos_autorizacao_frear":
{ Args: { "p_chave": string,"p_limite": number }; Returns: undefined
                           },
"fuso_da_uf":
{ Args: { "p_uf": string }; Returns: string
                           },
"gestao_assinatura":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"gestao_base":
{ Args: { "p": string }; Returns: Json
                           },
"gestao_bom_dia":
{ Args: { "p": string }; Returns: Json
                           },
"gestao_contagens":
{ Args: { "p": string }; Returns: Json
                           },
"gestao_copia_registrar":
{ Args: { "p_linhas": number,"p_quem": string,"p_tabelas": number }; Returns: undefined
                           },
"gestao_copia_tabelas":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"gestao_exclusoes_processar":
{ Args: { "p_limite"?: number,"p_petshop"?: string }; Returns: Json
                           },
"gestao_faxina_arquivos":
{ Args: { "p_limite"?: number,"p_petshop"?: string }; Returns: Json
                           },
"gestao_faxina_banco":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"gestao_hoje":
{ Args: { "a": Json,"p": string }; Returns: Json
                           },
"gestao_lgpd_arquivos":
{ Args: { "p_limite"?: number,"p_petshop"?: string }; Returns: Json
                           },
"gestao_modo_envio":
{ Args: { "p": string,"p_dias"?: number }; Returns: Json
                           },
"google_link_valido":
{ Args: { "p": string }; Returns: string
                           },
"hotel_busca_ate":
{ Args: { "p_petshop": string }; Returns: string
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
"indicadores_do_periodo":
{ Args: { "p": string,"p_ate": string,"p_de": string }; Returns: Json
                           },
"kit_definir_itens":
{ Args: { "p_itens": Json,"p_kit": string }; Returns: Json
                           },
"kits_recalcular":
{ Args: { "p_kits": (string)[] }; Returns: undefined
                           },
"leva_traz_estadia_marcar":
{ Args: { "p_estadia": string,"p_feito": boolean,"p_perna": string,"p_petshop": string }; Returns: Json
                           },
"leva_traz_marcar":
{ Args: { "p_agendamento": string,"p_feito": boolean,"p_perna": string,"p_petshop": string }; Returns: Json
                           },
"lgpd_anotar":
{ Args: { "p_acao": string,"p_detalhe"?: Json,"p_petshop": string }; Returns: undefined
                           },
"lgpd_dinheiro":
{ Args: { "n": number }; Returns: number
                           },
"lgpd_registrar_copia":
{ Args: { "p_linhas"?: number,"p_petshop": string }; Returns: undefined
                           },
"lgpd_registros_ver":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"lgpd_sou_titular":
{ Args: { "p": string }; Returns: boolean
                           },
"lgpd_texto_igual":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"lgpd_trocar_nomes":
{ Args: { "p_nomes": (string)[],"p_por": string,"p_texto": string }; Returns: string
                           },
"limite_de_acessos":
{ Args: { "p_plano": string }; Returns: number
                           },
"link_creche_experiencia":
{ Args: { "p_codigo": string }; Returns: Json
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
"link_fone_chave":
{ Args: { "p_fone": string }; Returns: string
                           },
"link_google":
{ Args: { "p_codigo": string }; Returns: string
                           },
"link_horarios":
{ Args: { "p_codigo": string,"p_dia": string,"p_pets"?: number,"p_servico": string }; Returns: string[]
                           },
"link_hotel_dia_recusado":
{ Args: { "p_dia": string,"p_hora": string,"p_petshop": string,"p_quando": string }; Returns: Json
                           },
"link_hotel_estimativa":
{ Args: { "p_codigo": string,"p_entrada": string,"p_juntos"?: boolean,"p_pets": Json,"p_saida": string }; Returns: Json
                           },
"link_hotel_opcoes":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"link_ia_contar":
{ Args: { "p_codigo": string,"p_segredo"?: string }; Returns: Json
                           },
"link_ia_ligada":
{ Args: { "p_codigo": string }; Returns: boolean
                           },
"link_ia_mes":
{ Args: { "p_petshop": string }; Returns: Json
                           },
"link_ia_registrar":
{ Args: { "p_codigo": string,"p_respondida": boolean,"p_segredo"?: string }; Returns: undefined
                           },
"link_info":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"link_limite":
{ Args: { "p_chave": string,"p_padrao": number }; Returns: number
                           },
"link_muitos_envios":
{ Args: { "p_fone": string,"p_petshop": string,"p_rede": string }; Returns: boolean
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
"link_pedido_muitos":
{ Args: { "p_id": string,"p_tipo": string }; Returns: boolean
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
"link_promocoes":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"link_rede":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"link_vaga":
{ Args: { "p_fim": string,"p_inicio": string,"p_petshop": string }; Returns: boolean
                           },
"loja_google":
{ Args: { "o": Json }; Returns: string
                           },
"lote_conferir_alvo":
{ Args: { "p_alvo": string,"p_campo": string,"p_passos": Json,"p_tipos": (string)[] }; Returns: undefined
                           },
"lote_guardar":
{ Args: { "p_chave": string,"p_petshop": string,"p_resultado": Json }; Returns: undefined
                           },
"lote_ja_feito":
{ Args: { "p_chave": string,"p_petshop": string }; Returns: Json
                           },
"lotes_baixar_perda":
{ Args: { "p_chave": string,"p_lotes": (string)[],"p_petshop": string }; Returns: Json
                           },
"lotes_consumir":
{ Args: { "p_mov": string,"p_petshop": string,"p_preferido": string,"p_produto": string,"p_qtd": number }; Returns: number
                           },
"lucro_comissoes":
{ Args: { "p": string,"p_ate": string,"p_de": string }; Returns: {
              "comissao": number,"nome": string,"produto_id": string,"servico_id": string,"tipo": string
            }[]
                           },
"lucro_do_periodo":
{ Args: { "p_ate": string,"p_de": string,"p_petshop": string }; Returns: Json
                           },
"lucro_pecas":
{ Args: { "p": string,"p_ate": string,"p_de": string }; Returns: {
              "agendamento_id": string,"categoria": string,"conta": string,"lancamento_id": string,"nome": string,"principal": boolean,"produto_id": string,"profissional_id": string,"qtd": number,"servico_id": string,"tipo": string,"valor": number,"vendido_por": string
            }[]
                           },
"lucro_repartir":
{ Args: { "p_itens": Json,"p_tipo": string,"p_total": number }; Returns: {
              "nome": string,"produto_id": string,"qtd": number,"servico_id": string,"valor": number
            }[]
                           },
"maquininha_parcelas":
{ Args: { "p": string,"p_ids": (string)[],"p_parcelas": number }; Returns: number
                           },
"maquininha_pergunta_parcelas":
{ Args: { "p": string }; Returns: boolean
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
"modo_envio_marcar":
{ Args: { "p": string,"p_refs": (string)[],"p_tipo": string }; Returns: Json
                           },
"niver_no_dia":
{ Args: { "p_dia": string,"p_nascimento": string }; Returns: boolean
                           },
"nome_na_equipe":
{ Args: { "p": string }; Returns: string
                           },
"opcoes_sem_valores":
{ Args: { "o": Json }; Returns: Json
                           },
"operacao_tudo_ou_nada":
{ Args: { "p_chave": string,"p_passos": Json,"p_petshop": string,"p_tipos"?: (string)[] }; Returns: Json
                           },
"orcamento_marcar":
{ Args: { "p_agendamento"?: string,"p_lancamento"?: string,"p_orcamento": string }; Returns: Json
                           },
"orcamento_publico":
{ Args: { "p_token": string }; Returns: Json
                           },
"orcamento_vender":
{ Args: { "p_chave": string,"p_orcamento": string,"p_passos": Json,"p_petshop": string }; Returns: Json
                           },
"pacotes_acabando":
{ Args: { "p": string,"p_pet"?: string }; Returns: Json
                           },
"pagamentos_conferidos":
{ Args: { "p_pagamentos": Json,"p_total": number }; Returns: Json
                           },
"parte_em_dinheiro":
{ Args: { "j": Json,"p_valor": number }; Returns: number
                           } |
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
"pet_e_dia":
{ Args: { "p_inicio": string,"p_pet": string,"p_petshop": string }; Returns: string
                           },
"petshop_diarias":
{ Args: { "p": string }; Returns: {
              "diaria_creche": number,"diaria_hotel": number,"id": string
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
"preco_de_tabela":
{ Args: { "p_pet": string,"p_petshop": string,"p_servico": string }; Returns: number
                           },
"preco_lista_do_servico":
{ Args: { "p_pet": string,"p_petshop": string,"p_servico": string }; Returns: number
                           },
"preco_travado":
{ Args: { "p": string }; Returns: boolean
                           },
"precos_dos_pacotes":
{ Args: { "p": string }; Returns: {
              "id": string,"preco": number,"vendido": boolean
            }[]
                           },
"produto_lotes":
{ Args: { "p": string,"p_produto": string }; Returns: Json
                           },
"produtos_gerar_codigos":
{ Args: { "p_petshop": string,"p_produtos": (string)[] }; Returns: {
              "codigo_barras": string,"id": string
            }[]
                           },
"produtos_precos":
{ Args: { "p": string }; Returns: {
              "id": string,"preco_venda": number
            }[]
                           },
"produtos_reservado":
{ Args: { "p": string }; Returns: {
              "custo": number,"id": string,"ultimo_custo": number
            }[]
                           },
"promo_da_estadia":
{ Args: { "p_criado_ate": string,"p_diaria": number,"p_entrada": string,"p_petshop": string,"p_saida": string,"p_tipo": string }; Returns: Json
                           },
"promo_desconto":
{ Args: { "p_itens": Json,"p_petshop": string,"p_principal": string,"p_promo": Json }; Returns: number
                           },
"promo_do_horario":
{ Args: { "p_criado_ate": string,"p_inicio": string,"p_petshop": string,"p_porte": string,"p_servico": string }; Returns: Json
                           },
"promo_servico_entra":
{ Args: { "p_petshop": string,"p_servico": string,"p_servicos": Json }; Returns: boolean
                           },
"promocao_apagar":
{ Args: { "p": string,"p_id": string }; Returns: boolean
                           },
"promocao_salvar":
{ Args: { "p": string,"p_dados": Json,"p_id": string }; Returns: string
                           },
"quadro_mover":
{ Args: { "p_agendamento": string,"p_para": string,"p_petshop": string }; Returns: Json
                           },
"receber_conta":
{ Args: { "p_chave"?: string,"p_conta": string,"p_data"?: string,"p_forma": string,"p_multa"?: number,"p_multa_forma"?: string,"p_multa_pagamentos"?: Json,"p_novo_vencimento"?: string,"p_pagamentos"?: Json,"p_valor": number }; Returns: Json
                           },
"receber_conta_com_credito":
{ Args: { "p_chave"?: string,"p_conta": string,"p_valor": number }; Returns: Json
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
"credito_usado": number | null,
"criado_em": string,
"criado_por": string | null,
"data": string,
"descricao": string | null,
"devido_desde": string | null,
"diferenca_de": string | null,
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
"pago_em": string | null,
"petshop_id": string,
"tipo": string,
"valor": number,
"valor_original": number | null,
"vencimento": string | null,
"vendido_por": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "lancamentos"
        isOneToOne: false
        isSetofReturn: true
      } },
"registrar_acesso":
{ Args: { "p_origem": string }; Returns: boolean
                           },
"registrar_conversa":
{ Args: { "p_canal": string,"p_pediu_equipe"?: boolean,"p_pergunta": string,"p_petshop": string,"p_resposta": string }; Returns: string
                           },
"relatorio_promocoes":
{ Args: { "p": string,"p_ate": string,"p_de": string }; Returns: Json
                           },
"serie_continuar":
{ Args: { "p_depois_de": string,"p_serie": string,"p_vezes"?: number }; Returns: number
                           },
"series_acabando":
{ Args: { "p": string }; Returns: {
              "cada_semanas": number,"pet_id": string,"pet_nome": string,"restantes": number,"serie_id": string,"servico_nome": string,"tutor_nome": string,"ultimo": string
            }[]
                           },
"servicos_custos":
{ Args: { "p": string }; Returns: {
              "custo_material": number,"id": string
            }[]
                           },
"servicos_do_horario_texto":
{ Args: { "p_agendamento": string,"p_servico": string }; Returns: string
                           },
"servicos_precos":
{ Args: { "p": string }; Returns: {
              "id": string,"preco_g": number,"preco_gg": number,"preco_m": number,"preco_p": number,"varia": boolean
            }[]
                           },
"servidor_segredo_ok":
{ Args: { "p_segredo": string }; Returns: boolean
                           },
"sou_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"sou_dono":
{ Args: { "p": string }; Returns: boolean
                           },
"taxa_calcular":
{ Args: { "p_data": string,"p_forma": string,"p_pagamentos": Json,"p_parcelas": number,"p_regra": Json,"p_valor": number }; Returns: Json
                           },
"taxa_do_lancamento":
{ Args: { "p_id": string,"p_parcelas"?: number }; Returns: undefined
                           },
"taxa_parcelas_ok":
{ Args: { "j": Json }; Returns: boolean
                           },
"taxas_do_periodo":
{ Args: { "p": string,"p_ate": string,"p_de": string }; Returns: Json
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
"tutor_codigo_novo":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"tutor_dias_fotos":
{ Args: { "p": string }; Returns: number
                           },
"tutor_do_codigo":
{ Args: { "p_token": string }; Returns: {
              "cliente_id": string,
"criado_em": string,
"criado_por": string | null,
"petshop_id": string,
"token": string,
"visto_em": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "tutor_links"
        isOneToOne: true
        isSetofReturn: false
      } },
"tutor_foto":
{ Args: { "p_foto": string,"p_token": string }; Returns: Json
                           },
"tutor_frear":
{ Args: { "p_cliente": string,"p_limite": number,"p_tipo": string }; Returns: undefined
                           },
"tutor_link":
{ Args: { "p_cliente": string }; Returns: string
                           },
"tutor_link_desligar":
{ Args: { "p_cliente": string }; Returns: undefined
                           },
"tutor_link_trocar":
{ Args: { "p_cliente": string }; Returns: string
                           },
"tutor_pagina":
{ Args: { "p_token": string }; Returns: Json
                           },
"tutor_pagina_ligada":
{ Args: { "p": string }; Returns: boolean
                           },
"tutor_ve_foto":
{ Args: { "p_nome": string }; Returns: boolean
                           },
"tutores_dinheiro":
{ Args: { "p_petshop": string }; Returns: {
              "cliente_id": string,"contas": number,"credito": number,"deve": number,"vencido": number
            }[]
                           },
"valor_cheio_do_horario":
{ Args: { "p_agendamento": string,"p_preco": number }; Returns: number
                           },
"valor_do_horario":
{ Args: { "p_agendamento": string }; Returns: number
                           },
"vejo_financeiro":
{ Args: { "p": string }; Returns: boolean
                           },
"venda_devolver":
{ Args: { "p_chave": string,"p_cliente"?: string,"p_forma"?: string,"p_itens": Json,"p_modo": string,"p_novos"?: Json,"p_petshop": string,"p_resto"?: string,"p_venda": string }; Returns: Json
                           },
"venda_devolvivel":
{ Args: { "p_petshop": string,"p_venda": string }; Returns: {
              "devolvido": number,"devolvido_valor": number,"nome": string,"pago": number,"produto_id": string,"vendido": number
            }[]
                           },
"venda_registrar":
{ Args: { "p_chave": string,"p_passos": Json,"p_petshop": string }; Returns: Json
                           },
"vendas_contar":
{ Args: { "p_segredo": string,"p_visitante": string }; Returns: boolean
                           },
"visitas_dos_pets":
{ Args: { "p": string,"p_agora"?: string,"p_hoje": string }; Returns: Json
                           },
"webhook_primeira_vez":
{ Args: { "p_chave": string }; Returns: boolean
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
