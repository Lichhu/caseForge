import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from "typeorm";
import { RequestContext } from "./request-context";

/** 自动填充实体的 createdBy / modifiedBy */
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<Record<string, unknown>>) {
    const entity = event.entity;
    if (!entity) {
      return;
    }
    const userName = RequestContext.getUserName();
    if (this.hasColumn(event, "createdBy")) {
      entity.createdBy = userName;
    }
    if (this.hasColumn(event, "modifiedBy")) {
      entity.modifiedBy = userName;
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>) {
    const entity = event.entity;
    if (!entity || !this.hasColumn(event, "modifiedBy")) {
      return;
    }
    entity.modifiedBy = RequestContext.getUserName();
  }

  private hasColumn(
    event: InsertEvent<Record<string, unknown>> | UpdateEvent<Record<string, unknown>>,
    propertyName: string,
  ) {
    return Boolean(event.metadata.findColumnWithPropertyName(propertyName));
  }
}
