import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import enUS from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { observer } from "mobx-react-lite";
import {
  Highlight,
  hoverHighlightsMobx,
  SheetConfig,
  SheetValueRow,
  TextDocument,
  textDocumentsMobx,
} from "./primitives";
import { FormulaColumn } from "./formulas";
import { useMemo, useState } from "react";
import { getTextForHighlight, isValueRowHighlight } from "./utils";
import addDays from "date-fns/addDays";
import { action } from "mobx";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { HighlightHoverCardContent } from "./HighlightHoverCard";

function getDateForRow(row: SheetValueRow) {
  const { day, month, year } =
    typeof row.data.year === "number" ? row.data : row.data.date.data;
  return new Date(2000 + year, month - 1, day);
}

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  highlight: Highlight;
};

function CalendarMonthEvent({
  event,
  title,
}: {
  event: CalendarEvent;
  title: string;
}) {
  return (
    <HoverCardPrimitive.Root openDelay={300}>
      <HoverCardPrimitive.Trigger asChild={true}>
        <div
          onMouseEnter={action(() => {
            const childrenHighlights = Object.values(
              event.highlight.data
            ).flatMap((columnData) =>
              isValueRowHighlight(columnData) ? [columnData] : []
            );
            hoverHighlightsMobx.replace(
              childrenHighlights.length > 0
                ? childrenHighlights
                : [event.highlight]
            );
          })}
          onMouseLeave={action(() => {
            hoverHighlightsMobx.clear();
          })}
        >
          {title}
        </div>
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Content
        side="top"
        sideOffset={2}
        className="bg-white font-serif p-4 rounded-lg shadow-lg"
      >
        <HoverCardPrimitive.Arrow className="fill-white" />
        <HighlightHoverCardContent highlight={event.highlight} />
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Root>
  );
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
        rows.map((row, i): CalendarEvent => {
          const date = getDateForRow(row);
          return {
            id: `${i}`,
            title: `${getTextForHighlight(row.data[titleColumnName])}`,
            start: date,
            end: addDays(date, 1),
            highlight: row as Highlight,
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
          components={{
            month: {
              event: CalendarMonthEvent,
            },
          }}
          localizer={localizer}
          views={[Views.MONTH, Views.WEEK]}
        />
      </div>
    );
  }
);
