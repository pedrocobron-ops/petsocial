import type { Metadata } from "next";
import Link from "next/link";
import { EMPRESA, identificacao, linkWhatsapp } from "@/lib/empresa";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Regras de compra, licença de uso, entrega, garantia de 7 dias e reembolso dos materiais do Maestro Pet.",
  alternates: { canonical: "/termos-de-uso" },
};

export default function TermosPage() {
  const id = identificacao();
  const wa = linkWhatsapp();
  return (
    <div className="container prose">
      <h1>Termos de uso</h1>
      <p className="prose-data">Última atualização: {EMPRESA.atualizadoEm}.</p>
      <p>
        Estes termos valem para quem visita o site maestropet.com e para quem compra qualquer material do {EMPRESA.marca}.
        Ao comprar, você declara que leu e concorda com eles. Se algo não estiver claro, escreva para{" "}
        <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> antes de comprar.
      </p>

      <h2>1. Quem vende</h2>
      <p>
        {id ? <>Os produtos são vendidos por <b>{id}</b>, sob a marca {EMPRESA.marca}.</> : <>Os produtos são vendidos sob a marca {EMPRESA.marca}.</>}{" "}
        Contato: <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
        {wa && <> ou <a href={wa}>WhatsApp</a></>}.
        O pagamento é processado pela Cakto, plataforma de pagamentos que emite o comprovante da compra.
      </p>

      <h2>2. O que vendemos</h2>
      <ul>
        <li><b>Guias e kits para tutores</b> (área <Link href="/tutor">Para tutores</Link>): materiais digitais em PDF para ler na tela ou imprimir, sobre cuidados, comportamento e rotina de cães e gatos.</li>
        <li><b>Manuais de negócio</b> (área <Link href="/negocios">Para negócios pet</Link>): materiais digitais com plano de trabalho, planilhas e modelos editáveis para quem quer trabalhar no mercado pet.</li>
        <li><b>Feed Pronto</b>: pacotes de posts editáveis no Canva, com legendas, para o perfil de negócios pet.</li>
      </ul>
      <p>
        Tudo é <b>produto digital</b>: nada é enviado pelo correio. O que vem em cada produto está descrito na página de venda dele,
        e essa descrição faz parte destes termos.
      </p>

      <h2>3. Preço e pagamento</h2>
      <p>
        O preço é o mostrado na página do produto. O valor final, com eventuais taxas da plataforma ou juros do parcelamento,
        aparece no checkout da Cakto antes de você confirmar. Aceitamos Pix e cartão de crédito. Não guardamos os dados do seu cartão:
        eles são digitados e processados apenas no ambiente da Cakto.
      </p>

      <h2>4. Entrega e acesso</h2>
      <ul>
        <li>Pagamento no Pix ou cartão aprovado: o acesso é enviado ao e-mail informado na compra, normalmente em poucos minutos.</li>
        <li>Confira a caixa de spam e a aba Promoções. Se não chegar em até 24 horas, escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail da compra.</li>
        <li>Guarde uma cópia dos arquivos no seu celular ou computador. Se perder, pedimos que nos escreva e reenviamos o acesso.</li>
        <li>Produtos ainda não lançados aparecem no site com o aviso &quot;Em breve&quot; e não podem ser comprados.</li>
      </ul>

      <h2>5. Licença de uso</h2>
      <p>Ao comprar, você recebe uma licença pessoal, não exclusiva e intransferível para usar o material. Isso quer dizer:</p>
      <ul>
        <li><b>Pode:</b> ler, imprimir para uso próprio e da sua família, preencher as planilhas e modelos e usá-los no seu dia a dia ou no seu negócio.</li>
        <li><b>Feed Pronto:</b> pode editar e publicar os posts nos perfis do seu próprio negócio (veja na página do produto quantos perfis cada pacote permite). Não pode revender os modelos nem repassá-los a outras empresas, nem como agência.</li>
        <li><b>Kits para imprimir:</b> pode imprimir quantas vezes quiser para uso próprio. Não pode vender as impressões nem os arquivos.</li>
        <li><b>Não pode:</b> copiar, revender, compartilhar em grupos, sites ou redes sociais, nem apresentar o conteúdo como seu.</li>
      </ul>
      <p>Os textos, ilustrações, o personagem Mozart e a marca {EMPRESA.marca} são protegidos pela Lei de Direitos Autorais (Lei 9.610/1998).</p>

      <h2>6. Garantia de 7 dias e reembolso</h2>
      <p>
        Pelo artigo 49 do Código de Defesa do Consumidor, você pode desistir da compra em até <b>7 dias corridos</b> a partir da data da compra
        e receber de volta 100% do valor pago, sem precisar justificar. Vale para Pix e cartão. Para pedir:
      </p>
      <ol>
        <li>Abra o e-mail de confirmação da compra enviado pela Cakto e use a opção de pedir reembolso; <b>ou</b></li>
        <li>escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail usado na compra e o nome do produto.</li>
      </ol>
      <p>
        No Pix, o valor volta para a conta de origem. No cartão, o estorno aparece na fatura atual ou na seguinte, conforme o banco.
        Depois do reembolso, o acesso ao material é encerrado e os arquivos devem ser apagados.
      </p>

      <h2>7. Caráter educativo e limites</h2>
      <ul>
        <li>Os materiais para tutores têm caráter educativo e <b>não substituem a avaliação de um(a) médico(a)-veterinário(a)</b> ou de um profissional de comportamento animal. Em caso de dor, doença ou mudança repentina de comportamento, procure um veterinário.</li>
        <li>Os manuais de negócio e o Feed Pronto <b>não garantem renda, vendas, seguidores ou qualquer resultado</b>. Os exemplos de valores são exemplos. O resultado depende do seu trabalho, da sua região e do mercado.</li>
        <li>Para impostos, contratos, licenças e regras sanitárias do seu ramo, procure um contador, um advogado ou o órgão responsável. Os manuais indicam as leis e os caminhos, mas não são consultoria jurídica ou contábil.</li>
        <li>Informações de leis, preços de mercado e plataformas citadas têm data e fonte e podem mudar depois da publicação.</li>
      </ul>

      <h2>8. Atualizações</h2>
      <p>
        Podemos corrigir ou melhorar os materiais. Quando houver uma nova versão, quem comprou pode pedir o arquivo atualizado sem custo.
        Estes termos também podem mudar; a data no topo mostra a última revisão, e vale a versão em vigor no dia da sua compra.
      </p>

      <h2>9. Privacidade</h2>
      <p>O uso dos seus dados está explicado na <Link href="/politica-de-privacidade">Política de privacidade</Link>.</p>

      <h2>10. Contato e foro</h2>
      <p>
        Dúvidas, problemas de acesso ou reclamações: <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
        {wa && <> ou <a href={wa}>WhatsApp</a></>}. Respondemos em até 2 dias úteis.
        Vale a lei brasileira, e você pode recorrer ao foro da sua cidade, como garante o Código de Defesa do Consumidor.
      </p>
    </div>
  );
}
