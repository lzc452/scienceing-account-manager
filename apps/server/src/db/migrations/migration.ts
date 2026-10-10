export interface Migration {
  version: number;
  name: string;
  sql: string;
  /** SQLite 换表时由执行器在事务外关闭外键，提交前仍强制检查外键。 */
  foreignKeysOff?: boolean;
  /** 返回违规行则中止；用于转换类型、添加约束前验证存量数据。 */
  preconditions?: readonly string[];
  /** 返回违规行则回滚；用于校验搬迁后行数、主键和字段值。 */
  checks?: readonly string[];
}
