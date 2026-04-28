We need to record a few more data points:
- T-2D close
- 52w High T-3D
- T-2D 52w Hi?(new flag)
- Add these datapoints as new columns to the table

Confirm the logic used for flags:
- Yest 52w Hi? = Yes if T-1D close >= 52w High T-2D, else 0
- T-2D 52w Hi? = Yes if T-2D close >= 52w High T-3D, else 0

Table Filter on App:
- Exclude if Yesterday was 52w High
-- This should have a border like the Refresh button so that users can easily identify it as a filter option
-- This should be left aligned after the "Last Updated" field
-- The toggle color has a problem: it correctly becomes blue when turned on, but when i turn it off, it still remains active and shows blue even though its value has already turned false and the table has updated. clicking elsewhere in the screen makes it non active and then the grey color shows as planned. Please fix this issue so that the toggle button correctly reflects its state visually at all times.
- Add another filter option: Exclude if T-2D was 52w High

Table Columns:
- Add 5 new colums to the table:
-- Change% (this is Price / T-1D Close - 1 displayed as percentage) and position this after
-- Ext-Hr Change% (this is Ext-Hr Price / T-1D Close - 1 displayed as percentage) and position this after Ext-Hr%
-- T-2D Close
-- 52w High T-3D
-- T-2D 52w Hi?
- The columns 52w High T-2D and 52w High T-3D are not important and should be hidden by default. But the user can have a small menu button on top right of the table to show/hide all columns as they wish.

Distance % Value:
- i see the value as 0.00% for some tickers and - 0.00% for other tickers. -0.00% should be displayed as 0.00% to avoid confusion, as both values represent the same percentage.
- also ensure this negative zero fix applies to Change% and Ext-Hr Change% columns as well

Refresh Button:
- Clicking the refresh button should refresh teh data for all tabs ( ie both Trending and Most Active Tabs as of current state) and not just the active tab