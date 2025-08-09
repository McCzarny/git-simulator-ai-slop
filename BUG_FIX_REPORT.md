# Bug Fix Report: Incorrect merge logic

## Problem Description
Merging 2 branches does not behave like it should work with git.
For this history:
```
* commit-0
|\
| * commit-6
| * commit-7 [134]
* commit-1
|\
| * commit-8
| * commit-9 [136]
* commit-2
* commit-3
|\
| * commit-10
| * commit-11
| * commit-12 [139]
* commit-4
* commit-5 [master]
```
Merging `139` into `master` should result in creation of a new commit with 2 parents: `commit-5` and `commit-12`. `master` should point to the new commit, while [139] stay unchanged.
The issue is that the merge may not behave correctly - either creating wrong parent structure or modifying existing commits.
