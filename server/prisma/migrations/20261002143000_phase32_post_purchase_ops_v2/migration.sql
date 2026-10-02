CREATE TYPE "CancellationRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'WITHDRAWN');
CREATE TYPE "ShipmentEventType" AS ENUM ('LABEL_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'RTO_INITIATED', 'RTO_DELIVERED', 'NOTE');

ALTER TABLE "Shipment" ADD COLUMN "estimatedDeliveryAt" TIMESTAMP(3);

CREATE TABLE "ShipmentEvent" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "type" "ShipmentEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderCancellationRequest" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "customerNote" TEXT,
    "adminNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderCancellationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnEvidence" (
    "id" UUID NOT NULL,
    "returnRequestId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnStatusHistory" (
    "id" UUID NOT NULL,
    "returnRequestId" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderCancellationRequest_orderId_key" ON "OrderCancellationRequest"("orderId");
CREATE INDEX "OrderCancellationRequest_status_requestedAt_idx" ON "OrderCancellationRequest"("status", "requestedAt");
CREATE INDEX "OrderCancellationRequest_userId_requestedAt_idx" ON "OrderCancellationRequest"("userId", "requestedAt");
CREATE INDEX "ShipmentEvent_shipmentId_eventAt_idx" ON "ShipmentEvent"("shipmentId", "eventAt");
CREATE INDEX "ShipmentEvent_type_eventAt_idx" ON "ShipmentEvent"("type", "eventAt");
CREATE INDEX "ReturnEvidence_returnRequestId_createdAt_idx" ON "ReturnEvidence"("returnRequestId", "createdAt");
CREATE INDEX "ReturnStatusHistory_returnRequestId_createdAt_idx" ON "ReturnStatusHistory"("returnRequestId", "createdAt");

ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCancellationRequest" ADD CONSTRAINT "OrderCancellationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCancellationRequest" ADD CONSTRAINT "OrderCancellationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnEvidence" ADD CONSTRAINT "ReturnEvidence_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnStatusHistory" ADD CONSTRAINT "ReturnStatusHistory_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
