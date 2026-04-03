import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useEditorStore, SearchResult, SearchMatch } from '../../store'
import '../../styles/SearchPanel.css'

const api = (window as any).api

export default function SearchPanel() {
  const { rootDir, openTab, toggleSearchPanel } = useEditorStore()
  const [query, setQuery] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const performSearch = useCallback(
    async (searchQuery: string, useRegex: boolean) => {
      if (!rootDir || !searchQuery) {
        setResults([])
        return
      }

      setIsSearching(true)
      try {
        const searchResults = await api.searchFiles(rootDir, searchQuery, useRegex)
        setResults(searchResults)
      } catch (error) {
        console.error('Search error:', error)
        setResults([])
      } finally {
        setIsSearching(false)
      }
    },
    [rootDir],
  )

  useEffect(() => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query, isRegex)
    }, 300)

    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [query, isRegex, performSearch])

  const handleResultClick = async (filePath: string, fileName: string, lineNumber: number) => {
    try {
      const content = await api.readFile(filePath)
      openTab(filePath, fileName, content)

      // Store the target line for the editor to scroll to
      sessionStorage.setItem('searchTargetLine', String(lineNumber))
    } catch (error) {
      console.error('Error opening file:', error)
    }
  }

  const handleClearSearch = () => {
    setQuery('')
    setResults([])
  }

  const resultCount = results.reduce((sum, file) => sum + file.matches.length, 0)

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <button
          className="search-back-btn"
          onClick={() => toggleSearchPanel()}
          title="Back to file tree"
        >
          ◀
        </button>
        <div className="search-input-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button className="search-clear-btn" onClick={handleClearSearch} title="Clear search">
              ✕
            </button>
          )}
        </div>

        <button
          className={`regex-toggle ${isRegex ? 'active' : ''}`}
          onClick={() => setIsRegex(!isRegex)}
          title="Toggle regex mode"
        >
          .*
        </button>
      </div>

      {query && (
        <div className="search-panel-info">
          {isSearching ? (
            <span className="search-status">Searching...</span>
          ) : (
            <span className="search-status">
              {resultCount} result{resultCount !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      )}

      <div className="search-results-container">
        {results.length > 0 ? (
          <div className="search-results">
            {results.map((result) => (
              <div key={result.filePath} className="search-result-file">
                <div className="search-result-file-header">{result.fileName}</div>
                <div className="search-result-matches">
                  {result.matches.map((match, matchIdx) => (
                    <div
                      key={`${result.filePath}-${matchIdx}`}
                      className="search-result-match"
                      onClick={() =>
                        handleResultClick(result.filePath, result.fileName, match.line)
                      }
                    >
                      <div className="match-line-number">{match.line}</div>
                      <div className="match-text-container">
                        <span className="match-text">
                          {match.text.substring(0, match.matchStart)}
                          <mark className="match-highlight">
                            {match.text.substring(match.matchStart, match.matchEnd)}
                          </mark>
                          {match.text.substring(match.matchEnd, match.text.length + 50)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : query && !isSearching ? (
          <div className="search-empty">No matches found</div>
        ) : !query ? (
          <div className="search-empty">Enter a search term to begin</div>
        ) : null}
      </div>
    </div>
  )
}
