/** 分类类目的公共约束：主进程校验与设置界面共用 */
export const TAG_CATEGORY_LIMIT = 30
export const TAG_CATEGORY_NAME_LIMIT = 12

/** 类目名会进 tags 表与 prompt：去首尾空格，禁止换行和逗号 */
export function normalizeTagCategoryName(raw: unknown): string {
  const name = String(raw ?? '').trim()
  if (!name) throw new Error('类目名不能为空')
  if (name.length > TAG_CATEGORY_NAME_LIMIT) {
    throw new Error(`类目名最多 ${TAG_CATEGORY_NAME_LIMIT} 个字`)
  }
  if (/[\r\n,]/.test(name)) throw new Error('类目名不能包含换行或逗号')
  return name
}
