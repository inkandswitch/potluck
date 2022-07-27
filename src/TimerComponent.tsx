import { action, computed, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import playPng from "./play.png";
import pausePng from "./pause.png";
import classNames from "classnames";

function formatDuration(durationSeconds: number) {
  let rv = "";
  if (durationSeconds > 60 * 60) {
    rv += `${Math.floor(durationSeconds / (60 * 60))}:`;
  }
  rv += `${`${Math.floor((durationSeconds % 3600) / 60)}`.padStart(2, "0")}:`;
  rv += `${Math.floor(durationSeconds % 60)}`.padStart(2, "0");
  return rv;
}

const Timer = observer(
  ({
    durationSeconds,
    state,
  }: {
    durationSeconds: number;
    state: {
      runningEndTime: number | undefined;
      pausedSecondsRemaining: number | undefined;
    };
  }) => {
    const [secondsRemainingBox] = useState(() =>
      observable.box<number | undefined>(undefined)
    );
    useEffect(() => {
      const runningEndTime = state.runningEndTime;
      if (runningEndTime !== undefined) {
        const tick = action(() => {
          const secondsRemaining = Math.round(
            (runningEndTime - Date.now()) / 1000
          );
          secondsRemainingBox.set(secondsRemaining);
        });
        tick();
        const interval = setInterval(tick, 100);
        return () => {
          clearInterval(interval);
        };
      }
    }, [state.runningEndTime]);
    const secondsRemaining = secondsRemainingBox.get();

    return (
      <div>
        {state.runningEndTime === undefined ? (
          <button
            onClick={action(() => {
              state.runningEndTime =
                Date.now() +
                (state.pausedSecondsRemaining ?? durationSeconds) * 1000;
              state.pausedSecondsRemaining = undefined;
            })}
            className="mr-1"
          >
            <img src={playPng} width="11px" height="11px" />
          </button>
        ) : (
          <button
            onClick={action(() => {
              state.pausedSecondsRemaining = secondsRemaining;
              state.runningEndTime = undefined;
            })}
            className="mr-1"
          >
            <img src={pausePng} width="11px" height="11px" />
          </button>
        )}
        <span className="font-mono">
          {secondsRemaining !== undefined ? (
            <span className={secondsRemaining < 0 ? "text-red-500" : undefined}>
              {formatDuration(Math.abs(secondsRemaining))}
              {secondsRemaining < 0 ? " over" : null}
            </span>
          ) : (
            formatDuration(durationSeconds)
          )}
        </span>
      </div>
    );
  }
);

function durationTextToSeconds(durationText: string): number {
  const regex = /(\d)+([hms])/g;
  let match;
  let seconds = 0;
  while ((match = regex.exec(durationText)) !== null) {
    switch (match[2]) {
      case "h": {
        seconds += parseInt(match[1]) * 60 * 60;
        break;
      }
      case "m": {
        seconds += parseInt(match[1]) * 60;
        break;
      }
      case "s": {
        seconds += parseInt(match[1]);
        break;
      }
    }
  }
  return seconds;
}

class TimerComponent {
  durationSeconds: number;
  state = observable({
    runningEndTime: undefined,
    pausedSecondsRemaining: undefined,
  });

  constructor(durationText: string) {
    this.durationSeconds = durationTextToSeconds(durationText);
  }

  render() {
    return <Timer durationSeconds={this.durationSeconds} state={this.state} />;
  }

  destroy() {}
}

export function createTimerComponent(durationText: string): TimerComponent {
  return new TimerComponent(durationText);
}
