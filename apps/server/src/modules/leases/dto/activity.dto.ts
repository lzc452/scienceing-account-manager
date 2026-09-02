export interface ActivityDto {
  /** 扩展上报的 leaseToken（也可通过 Authorization: Bearer 传递，PRD §9） */
  leaseToken?: string;
}
