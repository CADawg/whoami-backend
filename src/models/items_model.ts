export interface Item {
    item_id: number,
    user_id: number,
    type: string,
    name: string,
    subitems: SubItem[],
}

export interface SubItem {
    subitem_id: number,
    item_id: number,
    subitem_type: string,
    subitem_value: string
}