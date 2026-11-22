/** 分类类目的出厂默认值：顺序与颜色沿用旧版硬编码类目 */
export interface DefaultTagCategory {
  name: string
  color: string
}

export const DEFAULT_CATEGORIES: DefaultTagCategory[] = [
  { name: '风景', color: '#6fcf97' },
  { name: '城市建筑', color: '#7aa2f7' },
  { name: '人像', color: '#e8b45a' },
  { name: '动物', color: '#f2994a' },
  { name: '食物', color: '#eb5757' },
  { name: '静物', color: '#bb86fc' },
  { name: '街拍', color: '#56ccf2' },
  { name: '夜景', color: '#5c7cfa' },
  { name: '花草', color: '#27ae60' },
  { name: '交通工具', color: '#9aa7b8' },
  { name: '室内', color: '#d4a373' },
  { name: '截图文档', color: '#a0aec0' },
  { name: '艺术绘画', color: '#e07a5f' },
  { name: '运动', color: '#4ecdc4' }
]

/** 新增类目按顺序从这套色板取色，保证不同类目一眼能分开 */
export const CATEGORY_COLORS = DEFAULT_CATEGORIES.map((item) => item.color)
