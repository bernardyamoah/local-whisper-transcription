import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

type LanguageOption = { value: string; label: string };

export function LanguageCombobox({
  id,
  value,
  languages,
  onValueChange,
}: {
  id: string;
  value: string;
  languages: string[];
  onValueChange: (value: string) => void;
}) {
  const options = useMemo<LanguageOption[]>(() => {
    const names = new Intl.DisplayNames(["en"], { type: "language" });
    return [
      { value: "auto", label: "Detect automatically" },
      ...[...languages]
        .sort((a, b) => (names.of(a) || a).localeCompare(names.of(b) || b))
        .map((code) => ({ value: code, label: names.of(code) || code })),
    ];
  }, [languages]);
  const selected = options.find((option) => option.value === value) || null;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(option) => option && onValueChange(option.value)}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(option, current) => option.value === current.value}
      autoHighlight
    >
      <ComboboxInput
        id={id}
        className="language-combobox w-full"
        placeholder="Search languages…"
      />
      <ComboboxContent>
        <ComboboxEmpty>No languages found.</ComboboxEmpty>
        <ComboboxList>
          {(option: LanguageOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
