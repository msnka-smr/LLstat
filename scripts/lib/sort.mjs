// Сортировка таблицы в два ключа: неквалифицированные всегда внизу,
// внутри каждой группы — по выбранной колонке.
export function sortRows(rows, column, direction = "desc") {
  return [...rows].sort((a, b) => {
    if (a.isQualified !== b.isQualified) return a.isQualified ? -1 : 1;
    const av = a[column];
    const bv = b[column];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return 0;
    const ascending = av < bv ? -1 : 1;
    return direction === "asc" ? ascending : -ascending;
  });
}
