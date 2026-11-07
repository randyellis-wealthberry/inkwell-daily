# Homebrew tap

The formula is generated from `inkwell-daily.rb.in` so a release only has to
change the version and checksum.

## One-time setup

Create a public repository named `homebrew-tap` under the same GitHub account:

```bash
gh repo create randyellis-wealthberry/homebrew-tap --public \
  --description "Homebrew formulae for Wealthberry Labs tools"
```

Clone it beside this repo:

```bash
git clone https://github.com/randyellis-wealthberry/homebrew-tap.git ~/Developer/homebrew-tap
```

## Each release

After the tag `vX.Y.Z` exists (the release workflow creates it):

```bash
HOMEBREW_TAP_DIR=~/Developer/homebrew-tap scripts/update-tap.sh X.Y.Z
cd ~/Developer/homebrew-tap
git add Formula/inkwell-daily.rb
git commit -m "inkwell-daily X.Y.Z"
git push
```

Then anyone can install with:

```bash
brew install randyellis-wealthberry/tap/inkwell-daily
```

Homebrew installs Node alongside it, so the user never needs npm. The formula
links the command into Homebrew's `bin`, which is already on the PATH.

## Test locally before pushing

```bash
brew install --build-from-source ~/Developer/homebrew-tap/Formula/inkwell-daily.rb
brew test inkwell-daily
brew uninstall inkwell-daily
```
