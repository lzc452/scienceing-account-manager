/**
 * 客户端清理回执（POST /api/leases/:id/recycle-ack）。
 *
 * `ok` 必须是显式布尔：缺省当作失败处理，而不是「没说就是成功」。
 * 一次误判为成功会让账号立刻回到可用池，而那台机器上的令牌其实还在——
 * 这是整条回收链路里唯一不能容错的判断。
 */
export interface RecycleAckDto {
  ok?: boolean;
  /** 清理通道：PAGE（有页面，可回读复核）/ BROWSING_DATA（无页面，不可回读） */
  method?: string;
  /** 失败原因或补充信息，服务端截断到 500 字符后落库 */
  detail?: string;
}
