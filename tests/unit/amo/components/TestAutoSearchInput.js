import * as React from 'react';
import userEvent from '@testing-library/user-event';

import AutoSearchInput, {
  SEARCH_TERM_MIN_LENGTH,
} from 'amo/components/AutoSearchInput';
import {
  ADDON_TYPE_EXTENSION,
  CLIENT_APP_ANDROID,
  RECOMMENDED,
  SEARCH_SORT_POPULAR,
  SEARCH_SORT_RANDOM,
} from 'amo/constants';
import {
  AUTOCOMPLETE_STARTED,
  autocompleteCancel,
  autocompleteStart,
} from 'amo/reducers/autocomplete';
import {
  createFailedErrorHandler,
  createFakeAutocompleteResult,
  createFakeDebounce,
  createInternalSuggestionWithLang,
  dispatchAutocompleteResults,
  createHistory,
  dispatchClientMetadata,
  onLocationChanged,
  render as defaultRender,
  screen,
} from 'tests/unit/helpers';

describe(__filename, () => {
  let store;
  const defaultInputName = 'query';
  const errorHandlerId = `src/amo/components/AutoSearchInput/index.js-${defaultInputName}`;

  beforeEach(() => {
    store = dispatchClientMetadata().store;
  });

  const render = ({
    inputName = defaultInputName,
    location,
    onSuggestionSelected = jest.fn(),
    ...props
  } = {}) => {
    const renderOptions = {
      history: createHistory({
        initialEntries: [location || '/'],
      }),
      store,
    };
    return defaultRender(
      <AutoSearchInput
        debounce={createFakeDebounce()}
        inputName={inputName}
        onSuggestionSelected={onSuggestionSelected}
        {...props}
      />,
      renderOptions,
    );
  };

  const typeInSearch = (term = '') =>
    userEvent.type(screen.getByRole('searchbox'), `{selectall}{del}${term}`);

  describe('search input', () => {
    it('renders an initial query', () => {
      const query = 'adblocker';
      render({ location: `/?${defaultInputName}=${query}` });

      expect(screen.getByRole('searchbox')).toHaveValue(query);
    });

    it('sets the search value to an empty string when there is no `location.query`', () => {
      render({ location: '/' });

      expect(screen.getByRole('searchbox')).toHaveValue('');
    });

    it('sets the search value to an empty string when `location.query` is not a string', () => {
      // This will result in `[ 'a', 'b' ]` in `location.query`.
      render({ location: `/?${defaultInputName}=a&${defaultInputName}=b` });

      expect(screen.getByRole('searchbox')).toHaveValue('');
    });

    it('does not update the query on location changes', () => {
      const query = 'adblocker';
      const typedQuery = 'panda themes';
      render({ location: `/?${defaultInputName}=${query}` });

      typeInSearch(typedQuery);

      expect(screen.getByRole('searchbox')).toHaveValue(typedQuery);

      // Update the component with the same initial query. This should be
      // ignored.
      store.dispatch(
        onLocationChanged({
          pathname: '/',
          search: `?${query}`,
        }),
      );

      expect(screen.getByRole('searchbox')).toHaveValue(typedQuery);
    });

    it('lets you configure the input placeholder', () => {
      const inputPlaceholder = 'Type an add-on name';
      render({ inputPlaceholder });

      expect(screen.getByPlaceholderText(inputPlaceholder)).toBeInTheDocument();
    });

    it('lets you configure the input name', () => {
      const inputName = 'search-input';
      render({ inputName });

      expect(screen.getByRole('searchbox')).toHaveAttribute('name', inputName);
    });

    it('handles submitting a search', () => {
      const onSearch = jest.fn();
      render({ onSearch });

      const query = 'panda themes';
      typeInSearch(query);

      userEvent.click(screen.getByRole('button', { name: 'Search' }));
      expect(onSearch).toHaveBeenCalledWith({
        query,
      });
    });

    it('trims spaces from the input', () => {
      const onSearch = jest.fn();
      render({ onSearch });

      const query = 'panda themes';
      typeInSearch('     ');

      userEvent.click(screen.getByRole('button', { name: 'Search' }));

      expect(onSearch).toHaveBeenCalledWith({ query: '' });

      onSearch.mockClear();

      typeInSearch(`   ${query}   `);

      userEvent.click(screen.getByRole('button', { name: 'Search' }));

      expect(onSearch).toHaveBeenCalledWith({ query });
    });

    it('blurs the input when submitting a search', () => {
      render();

      const query = 'panda themes';
      typeInSearch(query);

      // eslint-disable-next-line testing-library/no-node-access
      const inputElement = document.getElementById('AutoSearchInput-query');
      const blur = jest.spyOn(inputElement, 'blur');

      userEvent.click(screen.getByRole('button', { name: 'Search' }));

      expect(blur).toHaveBeenCalled();
    });

    it('shows the input label by default', () => {
      render();

      expect(screen.getByTagName('label')).not.toHaveClass('visually-hidden');
    });

    it('lets you hide the input label', () => {
      render({ showInputLabel: false });

      expect(screen.getByTagName('label')).toHaveClass('visually-hidden');
    });

    it('lets you configure the input label text', () => {
      const inputLabelText = 'Search for add-ons';
      render({ inputLabelText });

      expect(screen.getByTagName('label')).toHaveTextContent(inputLabelText);
    });
  });

  describe('fetching search suggestions', () => {
    it('fetches search suggestions', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const query = 'ad blocker';
      render();

      typeInSearch(query);

      expect(dispatch).toHaveBeenCalledWith(
        autocompleteStart({
          errorHandlerId,
          filters: { query },
        }),
      );
    });

    it('fetches suggestions without a page', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const query = 'ad blocker';
      render({ location: '/?page=3' });

      typeInSearch(query);

      expect(dispatch).toHaveBeenCalledWith(
        autocompleteStart({
          errorHandlerId,
          // Make sure the search is executed without a page parameter.
          filters: { query },
        }),
      );
    });

    it('does not pass a `random` sort filter', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const query = 'ad blocker';
      render({ location: `/?sort=${SEARCH_SORT_RANDOM}` });

      typeInSearch(query);

      expect(dispatch).toHaveBeenCalledWith(
        autocompleteStart({
          errorHandlerId,
          // Make sure the search is executed without the sort parameter.
          filters: { query },
        }),
      );
    });

    it('does pass a sort filter that is not `random`', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const query = 'ad blocker';
      const sort = SEARCH_SORT_POPULAR;
      render({ location: `/?sort=${sort}` });

      typeInSearch(query);

      expect(dispatch).toHaveBeenCalledWith(
        autocompleteStart({
          errorHandlerId,
          filters: { query, sort },
        }),
      );
    });

    it('preserves existing search filters on the query string', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const query = 'ad blocker';
      const type = ADDON_TYPE_EXTENSION;
      render({ location: `/?type=${type}` });

      typeInSearch(query);

      expect(dispatch).toHaveBeenCalledWith(
        autocompleteStart({
          errorHandlerId,
          filters: { addonType: type, query },
        }),
      );
    });

    it('does not fetch suggestions for a really short value', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      render();

      typeInSearch('t'.repeat(SEARCH_TERM_MIN_LENGTH - 1));

      expect(dispatch).toHaveBeenCalledWith(autocompleteCancel());
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: AUTOCOMPLETE_STARTED }),
      );
    });

    it('keeps the search results menu open while searching', () => {
      dispatchAutocompleteResults({
        results: [createFakeAutocompleteResult()],
        store,
      });
      render();

      typeInSearch('panda themes');

      expect(screen.getByClassName('AutoSearchInput')).toHaveClass(
        'AutoSearchInput--autocompleteIsOpen',
      );
    });

    it('keeps the search results menu open when focused', () => {
      dispatchAutocompleteResults({
        results: [createFakeAutocompleteResult()],
        store,
      });
      render();

      // We need to type in the search field to show results.
      typeInSearch('something');
      // Tab away from search field.
      userEvent.tab();
      // Tab back to search field.
      userEvent.tab({ shift: true });

      expect(screen.getByClassName('AutoSearchInput')).toHaveClass(
        'AutoSearchInput--autocompleteIsOpen',
      );
    });
  });

  describe('clearing search suggestions', () => {
    it('closes suggestion menu on escape', () => {
      dispatchAutocompleteResults({
        results: [createFakeAutocompleteResult()],
        store,
      });
      render();

      // We need to type in the search field to show results.
      typeInSearch('something');
      expect(screen.getByClassName('AutoSearchInput')).toHaveClass(
        'AutoSearchInput--autocompleteIsOpen',
      );

      // Typing escape should close the menu.
      typeInSearch('{esc}');
      expect(screen.getByClassName('AutoSearchInput')).not.toHaveClass(
        'AutoSearchInput--autocompleteIsOpen',
      );
    });

    it('cancels pending requests on autosuggest cancel', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      render();

      typeInSearch('something');
      dispatch.mockClear();

      typeInSearch('{esc}');
      expect(dispatch).toHaveBeenCalledWith(autocompleteCancel());
    });
  });

  describe('selecting search suggestions', () => {
    it('executes a callback when selecting a suggestion', () => {
      const fakeResult = createFakeAutocompleteResult();
      const onSuggestionSelected = jest.fn();
      render({ onSuggestionSelected });

      typeInSearch('test');

      dispatchAutocompleteResults({ results: [fakeResult], store });

      userEvent.click(screen.getByRole('option'));

      expect(onSuggestionSelected).toHaveBeenCalledWith(
        createInternalSuggestionWithLang(fakeResult),
      );
    });

    it('does not execute callback when selecting a placeholder', () => {
      const onSuggestionSelected = jest.fn();
      store.dispatch(
        autocompleteStart({
          errorHandlerId,
          filters: { query: 'ad blockers' },
        }),
      );
      render({ onSuggestionSelected });

      typeInSearch('test');

      userEvent.click(screen.getAllByRole('option')[0]);

      expect(onSuggestionSelected).not.toHaveBeenCalled();
    });

    it('closes suggestion menu when selecting a suggestion', () => {
      render();

      typeInSearch('test');

      dispatchAutocompleteResults({
        results: [createFakeAutocompleteResult()],
        store,
      });

      userEvent.click(screen.getByRole('option'));

      expect(screen.getByClassName('AutoSearchInput')).not.toHaveClass(
        'AutoSearchInput--autocompleteIsOpen',
      );
    });

    it('resets the search query when selecting a suggestion', () => {
      const query = 'test';
      render();

      typeInSearch(query);
      expect(screen.getByRole('searchbox')).toHaveValue(query);

      dispatchAutocompleteResults({
        results: [createFakeAutocompleteResult()],
        store,
      });

      userEvent.click(screen.getByRole('option'));

      expect(screen.getByRole('searchbox')).toHaveValue('');
    });
  });

  it('renders a suggestion', () => {
    const iconUrl = `https://addons.mozilla.org/user-media/some-icon.png`;
    const name = 'suggestion name';
    const selectSuggestionText = 'Visit extension detail page';
    const fakeResult = createFakeAutocompleteResult({
      icon_url: iconUrl,
      name,
      type: ADDON_TYPE_EXTENSION,
    });
    render({ selectSuggestionText });

    typeInSearch('test');

    dispatchAutocompleteResults({ results: [fakeResult], store });

    expect(screen.getByAltText(name)).toHaveAttribute('src', iconUrl);
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Verifies that the selectSuggestionText was passed as alt text to the
    // arrow icon.
    expect(screen.getByText(selectSuggestionText)).toHaveClass(
      'visually-hidden',
    );

    // Verifies that SearchSuggestion displays a class name with its type.
    expect(screen.getByClassName('SearchSuggestion')).toHaveClass(
      `SearchSuggestion--${ADDON_TYPE_EXTENSION}`,
    );
  });

  describe('getting suggestion data', () => {
    it('returns suggestion results', () => {
      const firstName = 'Addon One';
      const secondName = 'Addon Two';
      const firstResult = createFakeAutocompleteResult({ name: firstName });
      const secondResult = createFakeAutocompleteResult({ name: secondName });
      render();

      typeInSearch('test');

      dispatchAutocompleteResults({
        results: [firstResult, secondResult],
        store,
      });

      expect(screen.getByText(firstName)).toBeInTheDocument();
      expect(screen.getByAltText(firstName)).toBeInTheDocument();
      expect(screen.getByText(secondName)).toBeInTheDocument();
      expect(screen.getByAltText(secondName)).toBeInTheDocument();
    });

    it('configures search suggestions in a loading state', () => {
      store.dispatch(
        autocompleteStart({
          errorHandlerId,
          filters: { query: 'ad blockers' },
        }),
      );

      render();

      typeInSearch('test');

      // Exactly 10 placeholders are returned.
      expect(screen.getAllByRole('alert')).toHaveLength(10);
    });
  });

  it('sets an `id` to the input and a `htmlFor` attribute to the `label`', () => {
    const inputLabelText = 'Label for input';
    const inputName = 'my-custom-input';
    render({ inputLabelText, inputName });

    expect(
      screen.getByRole('searchbox', { name: inputLabelText }),
    ).toHaveAttribute('id', `AutoSearchInput-${inputName}`);
  });

  it('renders errors', () => {
    const message = 'Some error message';
    createFailedErrorHandler({
      id: errorHandlerId,
      message,
      store,
    });

    render();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  describe('Tests for SearchSuggestion', () => {
    it('displays a promoted icon when the add-on is promoted', () => {
      const result = createFakeAutocompleteResult({
        promoted: { category: RECOMMENDED, apps: [CLIENT_APP_ANDROID] },
      });
      render();

      typeInSearch('test');

      dispatchAutocompleteResults({ results: [result], store });

      expect(screen.getByText('Recommended')).toHaveClass('visually-hidden');
    });

    it('does not display a promoted icon when the add-on is not promoted', () => {
      const result = createFakeAutocompleteResult({ promoted: null });
      render();

      typeInSearch('test');

      dispatchAutocompleteResults({ results: [result], store });

      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    });
  });
});
