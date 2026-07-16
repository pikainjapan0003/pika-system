export const ORDER_MESSAGE_TEMPLATE_TYPES = [
  "confirmation",
  "arrival",
  "payment_reminder",
] as const;

export type OrderMessageTemplateType =
  (typeof ORDER_MESSAGE_TEMPLATE_TYPES)[number];

export const ORDER_MESSAGE_TEMPLATE_LABELS: Record<
  OrderMessageTemplateType,
  string
> = {
  confirmation: "訂單確認",
  arrival: "到貨通知",
  payment_reminder: "催款提醒",
};

export interface OrderMessageTemplateData {
  orderNumber: string;
  productSummary: string;
  amountTwd: string;
  pickupMethod: string;
}

const details = (data: OrderMessageTemplateData) =>
  [
    `訂單編號：${data.orderNumber}`,
    `商品：${data.productSummary}`,
    `金額：NT$ ${data.amountTwd}`,
    `取貨方式：${data.pickupMethod}`,
  ].join("\n");

export const ORDER_MESSAGE_TEMPLATES: Record<
  OrderMessageTemplateType,
  (data: OrderMessageTemplateData) => string
> = {
  confirmation: (data) =>
    `您好，您的訂單已確認。\n${details(data)}\n謝謝您的訂購！`,
  arrival: (data) =>
    `您好，您的訂單已到貨，請依約定方式取貨。\n${details(data)}\n謝謝！`,
  payment_reminder: (data) =>
    `您好，提醒您這筆訂單尚有款項待付款。\n${details(data)}\n若已付款，請忽略此訊息，謝謝！`,
};

export function buildOrderMessage(
  type: OrderMessageTemplateType,
  data: OrderMessageTemplateData,
): string {
  return ORDER_MESSAGE_TEMPLATES[type](data);
}
