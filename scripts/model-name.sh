# Resolves a model's source name to the camelCase name it is served under.
# Source this, then call `model_name <source>`; see scripts/model-names.txt.

# Resolved once, here, rather than inside the function: ${BASH_SOURCE} is a relative path,
# so working it out at call time gives the wrong answer the moment a caller has cd'd
# somewhere else — and renaming files is exactly the job that cd's around.
MODEL_NAMES="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)/model-names.txt"

model_name() {
  local source="$1"
  # A missing map used to mean every name quietly took the mechanical path, which is how
  # `BenQ_Screenbar_Halo` first got written out as `benqScreenbarHalo`. Wrong filenames are
  # the one failure this script must not produce silently, so this is fatal.
  if [ ! -f "$MODEL_NAMES" ]; then
    echo "model-name.sh: cannot find $MODEL_NAMES" >&2
    return 1
  fi

  # A mapped name wins. Tab-separated, comments and blank lines skipped.
  local from to
  while IFS=$'\t' read -r from to; do
    case "$from" in ''|'#'*) continue ;; esac
    if [ "$from" = "$source" ]; then
      printf '%s\n' "$to"
      return
    fi
  done < "$MODEL_NAMES"

  # Otherwise convert mechanically: split on anything that is not a letter or digit, then
  # lower the first word and capitalise the rest. A camelCase name cannot start with a
  # digit, so any leading digit-initial words rotate to the end instead — which is how
  # both `3d-printer` and `3D_Printer` come out as `printer3d`.
  printf '%s\n' "$source" | awk '
    {
      n = split(tolower($0), raw, /[^a-zA-Z0-9]+/)
      count = 0
      for (i = 1; i <= n; i++) if (raw[i] != "") word[++count] = raw[i]

      # Rotate rather than strip, so the digits stay attached to the unit they belong to.
      guard = count
      while (count > 1 && word[1] ~ /^[0-9]/ && guard-- > 0) {
        first = word[1]
        for (i = 1; i < count; i++) word[i] = word[i + 1]
        word[count] = first
      }

      out = ""
      for (i = 1; i <= count; i++)
        out = out ((out == "") ? word[i] : toupper(substr(word[i], 1, 1)) substr(word[i], 2))
      print out
    }'
}
