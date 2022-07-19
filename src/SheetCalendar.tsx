import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enUS from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { observer } from "mobx-react-lite";
import { SheetConfig, SheetValueRow, TextDocument } from "./primitives";
import { FormulaColumn } from "./formulas";
import { useMemo, useState } from "react";
import { getTextForHighlight } from "./utils";
import addDays from "date-fns/addDays";

function getDateForRow(row: SheetValueRow) {
  const { day, month, year } =
    typeof row.data.year === "number" ? row.data : row.data.date.data;
  return new Date(2000 + year, month - 1, day);
}

export const SheetCalendar = observer(
  ({
    textDocument,
    sheetConfig,
    columns,
    rows,
  }: {
    textDocument: TextDocument;
    sheetConfig: SheetConfig;
    columns: FormulaColumn[];
    rows: SheetValueRow[];
  }) => {
    const localizer = dateFnsLocalizer({
      format,
      parse,
      startOfWeek,
      getDay,
      locales: {
        "en-US": enUS,
      },
    });
    const titleColumnName = sheetConfig.columns[0].name;
    const events = useMemo(
      () =>
        rows.map((row, i) => {
          const date = getDateForRow(row);
          return {
            id: `${i}`,
            title: `${getTextForHighlight(row.data[titleColumnName])}`,
            start: date,
            end: addDays(date, 1),
          };
        }),
      [rows]
    );
    const [defaultDate] = useState(() => getDateForRow(rows[rows.length - 1]));
    return (
      <div className="h-[512px]">
        <Calendar
          defaultDate={defaultDate}
          events={events}
          localizer={localizer}
          views={[Views.MONTH, Views.WEEK]}
        />
      </div>
    );
  }
);
