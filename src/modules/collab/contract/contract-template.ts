import { createHash } from "node:crypto";
import type { ProjectContract } from "../collab.types";

const money = (amount: number, currency: string) => new Intl.NumberFormat("es-CO", {
  style: "currency", currency, minimumFractionDigits: 0,
}).format(amount);

/** Generates the immutable text accepted by the client from the approved draft values. */
export const buildContractSnapshot = (contract: ProjectContract, projectName: string) => {
  const clientIdentity = contract.clientKind === "juridical"
    ? `${contract.clientCompanyName}, identificada con NIT ${contract.clientTaxId}, representada legalmente por ${contract.clientRepresentative}, identificado(a) con documento ${contract.clientRepresentativeDocument}`
    : `${contract.clientName}, documento ${contract.clientDocument}`;
  const providerIdentity = [contract.providerName, contract.providerTaxId ? `NIT/Documento ${contract.providerTaxId}` : null, contract.providerRepresentative ? `representado por ${contract.providerRepresentative}` : null, contract.providerRepresentativeDocument ? `documento ${contract.providerRepresentativeDocument}` : null]
    .filter(Boolean).join(", ");
  const billingDocument = contract.providerKind === "cima" ? "facturas detalladas" : "cuentas de cobro";
  const clientSigningIdentity = contract.clientKind === "juridical"
    ? `Firma del representante legal: ${contract.clientRepresentative}`
    : `Firma del cliente: ${contract.clientName}`;

  return [
    "CONTRATO DE PRESTACIÓN DE SERVICIOS DE GESTIÓN DE REDES SOCIALES",
    `Proyecto: ${projectName}`,
    "",
    `Entre ${providerIdentity}, en adelante EL PRESTADOR, y ${clientIdentity}, en adelante EL CLIENTE, se celebra el presente contrato de prestación de servicios profesionales de gestión de redes sociales.`,
    "",
    "CLÁUSULA PRIMERA. OBJETO.",
    `EL PRESTADOR se compromete a proporcionar servicios profesionales de administración de redes sociales para el proyecto ${projectName}. El servicio corresponde al plan ${contract.planName} e incluye: ${contract.serviceScope}`,
    "PARÁGRAFO PRIMERO. EL CLIENTE proporcionará oportunamente los medios, insumos, accesos, imágenes, logotipos, autorizaciones y demás materiales necesarios para producir y publicar los entregables acordados.",
    "",
    "CLÁUSULA SEGUNDA. CONTRAPRESTACIÓN Y FORMA DE PAGO.",
    `EL CLIENTE pagará a EL PRESTADOR la suma mensual de ${money(contract.monthlyFee, contract.currency)} por los servicios del plan ${contract.planName}. El pago se realiza por mes anticipado.${contract.taxIncluded ? " El valor mensual incluye los impuestos aplicables." : " El valor no incluye IVA."}`,
    `EL PRESTADOR emitirá ${billingDocument} por los servicios prestados. Las condiciones sobre anticipos, cancelaciones o devoluciones se regirán por los acuerdos comerciales y las normas aplicables.`,
    "",
    "CLÁUSULA TERCERA. DURACIÓN.",
    `El contrato tendrá una duración de ${contract.termMonths} mes${contract.termMonths === 1 ? "" : "es"}, contada desde la fecha de su firma electrónica. Las partes podrán revisar, renovar o modificar sus términos por escrito al finalizar el período.`,
    "",
    "CLÁUSULA CUARTA. CONTENIDO Y COLABORACIÓN.",
    "EL CLIENTE se compromete a proporcionar acceso oportuno y completo a la información, materiales y recursos requeridos para la ejecución de los servicios, incluyendo imágenes, logotipos y cualquier contenido necesario para publicaciones y campañas.",
    "",
    "CLÁUSULA QUINTA. PROPIEDAD INTELECTUAL.",
    "Los derechos de propiedad intelectual sobre el contenido creado y desarrollado durante la ejecución del contrato pertenecerán a EL CLIENTE, salvo pacto escrito diferente o derechos preexistentes de terceros.",
    "",
    "CLÁUSULA SEXTA. CONFIDENCIALIDAD.",
    "Las partes se obligan a conservar la confidencialidad de la información sensible, exclusiva o no pública revelada durante la ejecución de los servicios, salvo obligación legal o autorización escrita.",
    "",
    "CLÁUSULA SÉPTIMA. TERMINACIÓN.",
    "Cualquiera de las partes podrá terminar el contrato mediante notificación escrita con al menos veinte (20) días de antelación a la siguiente facturación. EL CLIENTE deberá pagar los servicios efectivamente prestados hasta la fecha de terminación.",
    contract.additionalTerms?.trim() ? `\nCondiciones adicionales\n${contract.additionalTerms.trim()}` : "",
    "",
    `En aceptación de lo anterior, ${clientSigningIdentity}. El contrato se firma electrónicamente en ${contract.signatureCity}.`,
    "Al firmar electrónicamente, EL CLIENTE declara que leyó, comprendió y acepta íntegramente este documento.",
  ].filter(Boolean).join("\n");
};

export const hashContractSnapshot = (snapshot: string) => createHash("sha256").update(snapshot, "utf8").digest("hex");
