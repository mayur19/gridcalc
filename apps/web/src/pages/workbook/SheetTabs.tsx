export interface SheetTab {
  readonly id: string;
  readonly name: string;
}

export function SheetTabs(props: {
  readonly sheets: readonly SheetTab[];
  readonly activeId: string;
  readonly canAdd: boolean;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
}) {
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Sheets">
      {props.sheets.map((sheet) => (
        <button
          key={sheet.id}
          type="button"
          role="tab"
          aria-selected={sheet.id === props.activeId}
          className={`sheet-tab${sheet.id === props.activeId ? ' active' : ''}`}
          onClick={() => props.onSelect(sheet.id)}
        >
          {sheet.name}
        </button>
      ))}
      {props.canAdd && (
        <button
          type="button"
          className="sheet-tab add"
          aria-label="Add sheet"
          onClick={props.onAdd}
        >
          +
        </button>
      )}
    </div>
  );
}
