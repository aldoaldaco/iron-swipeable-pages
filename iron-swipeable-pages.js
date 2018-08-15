(function() {
  'use strict';

  Polymer({
    is: 'iron-swipeable-pages',

    behaviors: [
      Polymer.IronResizableBehavior,
      Polymer.IronSelectableBehavior
    ],

    properties: {
      /**
       * as the selected page is the only one visible, activateEvent
       * is both non-sensical and problematic; e.g. in cases where a user
       * handler attempts to change the page and the activateEvent
       * handler immediately changes it back
       */
      activateEvent: {
        type: String,
        readOnly: true,
        value: null
      },

      /**
       * Add extra padding to the offsetWidth while swiping
       * Useful if the element is nested within other elements that enforce a padding
       */
      padding: {
        type: Number,
        value: 0
      },

      /**
       * The value used to decide if a transition is effective and therefore
       * if the page get swiped.
       */
      threshold: {
        type: Number,
        value: 0.3
      },

      /**
       * Prevent cycling between first and last pages by swiping.
       */
      noCycle: {
        type: Boolean,
        value: false
      },

      /**
       * animate wrap-around between first and last as a direct transition
       * like a carousel. this animation is only used when iron-select is
       * fired from something OTHER a swipe. e.g. a call to selectNext()
       * like you might make from a button or an a11y arrow-key binding.
       * if false the wrap around flips backwards across all the pages.
       */
      carousel: {
        type: Boolean,
        value: false
      },

      /**
       * The CSS transition duration applied swiping to next/previous page
       */
      transitionDuration: {
        type: Number,
        value: 250
      },

      /**
       * The maximum global CSS transition duration applied if swiping involves more than one
       * page transition using selection instead of manual swiping.
       */
      maximumTransitionDuration: {
        type: Number,
        value: 0
      },

      /**
       * The CSS transition timing function applied.
       */
      transitionTimingFunction: {
        type: String,
        value: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
      },

      /**
       * This option could be used for example to check in `on-selected-changed` that
       * the selection was initiated by gesture or via data-binding or programmatically
       */
      isGesture: {
        type: Boolean,
        value: false
      },

      /**
       * How many pixels on the side of the screen are not sensitive to edge swipes.
       */
      edgeSwipeSensitivity: {
        type: Number,
        value: 0
      },

      /**
       * This option could be used to disable swiping.
       */
      swipeDisabled: {
        type: Boolean,
        value: false
      },

      /**
       * This option could also be used to disable swiping. (Warning : it could have side effect on IE, like disable scroll)
       */
      disabled: {
        type: Boolean,
        value: false
      },

      /**
       * Returns whether the track is enabled.
       */
      trackEnabled: {
        type: Boolean,
        value: false,
        readOnly: true,
      },

      /**
       * Returns the cached offsetWidth of the component.
       * The value is updated when the window is resized.
       */
      sliderWidth: {
        type: Number,
        readOnly: true,
      },
    },

    observers: [
      '_onFallbackSelectionChange(fallbackSelection)'
    ],

    listeners: {
      'iron-items-changed': '_onItemsChanged',
      'iron-deselect': '_onIronDeselectItem',
      'iron-select': '_onIronSelectItem',
      'track': '_onTrack',
      'iron-resize': '_onResize'
    },

    ready: function() {
      this.setScrollDirection('y');
      this._animatedPages = [];
    },

    _onItemsChanged: function(event) {
      var mutations = event.detail;
      for (var i = 0; i < mutations.addedNodes.length; i++) {
        this._addPage(mutations.addedNodes[i]);
      }
      for (var j = 0; j < mutations.removedNodes.length; j++) {
        this._removePage(mutations.removedNodes[j]);
      }
    },

    _addPage: function(page) {
      if (!page || page.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      page.setAttribute('aria-hidden', !page.classList.contains('iron-selected'));
      this.listen(page, 'webkitTransitionEnd', '_onTransitionEnd');
      this.listen(page, 'transitionend', '_onTransitionEnd');
    },

    _removePage: function(page) {
      if (!page || page.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      this.unlisten(page, 'webkitTransitionEnd', '_onTransitionEnd');
      this.unlisten(page, 'transitionend', '_onTransitionEnd');
    },

    _onFallbackSelectionChange: function(event) {
      if (!this.fallbackSelection) {
        this.unlisten(this, 'dom-change', '_onDomChange');
      } else {
        this.listen(this, 'dom-change', '_onDomChange');
      }
    },

    _onDomChange: function(event) {
      if (this.selectedItem && this.selectedItem.offsetWidth === 0) {
        this.selected = this.fallbackSelection;
      }
    },

    // Element tracking
    _onTrack: function(event) {
      var track = event.detail;

      if (this._isSwipeDisabled() || (this.noCycle && !this._canCycle(track))) {
        this._setTrackEnabled(false);
        return;
      }

      this._setTrackEnabled(true);

      if ((track.x - track.dx) < this.edgeSwipeSensitivity || (track.x - track.dx) > this.offsetWidth - this.edgeSwipeSensitivity) {
        return;
      }

      if (track.state === 'start' && Math.abs(track.dy) < Math.abs(track.dx)) {
        // if we don't have at least 2 items, no need to swipe...
        if (this.items.length < 2) {
          return;
        }
        this._trackStart(track);

        this._swipeStarted = true;
      } else if (track.state === 'track' && this._swipeStarted) {
        this._trackMove(track);
      } else if (track.state === 'end' && this._swipeStarted) {
        this._trackEnd(track);
      }
    },

    _isSwipeDisabled: function() {
      return this.disabled || this.swipeDisabled;
    },

    _trackStart: function(trackData) {
      if (this._transitionRunning) {
        this._resetPages();
      }
      this._setUpSwipePages();
      this._animatePages(trackData.dx);
      this._switchPageIfNecessary(trackData.dx);

      // Prevent regular touchmove event (disables vertical scroll)
      window.addEventListener('touchmove', this._preventTouchMove);
    },

    _trackMove: function(trackData) {
      this._animatePages(trackData.dx);
      this._switchPageIfNecessary(trackData.dx);
    },

    _trackEnd: function(trackData) {
      if (!this._swipeStarted) {
        return;
      }

      // Activate transition
      for (var i = 0; i < this._animatedPages.length; i++) {
        this._animatedPages[i].style.webkitTransition = this._computeTransition(1);
        this._animatedPages[i].style.transition = this._computeTransition(1);
      }
      this._transitionRunning = true;

      // The element is swiped away if the swiping get passed the treshold.
      this._completeSwipe = Math.abs(trackData.dx) > this._getOffsetWidth() * this.threshold;
      if (this._completeSwipe) {
        this.isGesture = true;
        var direction = trackData.dx > 0;

        // we are swipping, therefore update selected
        var targetPage = (direction) ? this._leftCandidate : this._rightCandidate;
        this._selectPage(targetPage);

        // trigger the animation in the proper direction
        this._animatePages(direction ? this._getOffsetWidth() : -this._getOffsetWidth());
      } else {
        this._animatePages(0);
      }

      // Enable regular touchmove event (enables vertical scroll again)
      window.removeEventListener('touchmove', this._preventTouchMove);
    },

    _preventTouchMove: function(e) {
      return e && e.preventDefault();
    },

    _onIronDeselectItem: function(event) {
      // Prevent bubbling of same event on child elements
      if (event.target !== this) {
        return;
      }

      this._lastIndex = this.indexOf(event.detail.item);
    },

    _onIronSelectItem: function(event) {
      // Prevent bubbling of same event on child elements
      if (event.target !== this) {
        return;
      }

      // might happen at init of the component when first selected value is set and ready not called....
      // or when a "selected" page disappear from the dom because of a "dom-if" with restamp option active
      if (this._lastIndex === undefined || this._lastIndex === -1) {
        return;
      }

      if (this._completeSwipe) {
        // we just need to reset the flag, the transformation happened already by swiping
        this._completeSwipe = false;
        return;
      }

      // check if a transition is currently running
      if (this._transitionRunning) {
        // reset pages state and we don't trigger any new animation because lastIndex is not valid anymore
        this._resetPages();
        return;
      }

      this._translate(event);
    },

    _translate: function(event) {
      // reset the animated page list
      this._animatedPages = [];

      var index = this.indexOf(event.detail.item);

      // skipped is used to filter the hidden element since they have a width == 0
      // we use a negative value if we translate to the right
      var skipped = 0;

      // in this case, selected has been modify w/o swiping, we need to apply the transformation

      // This stuff supports carousel style wrap-around animation
      var translateRight;
      var virtualLastIndex = this._lastIndex;
      var virtualIndex = index;
      var len = this.items.length;

      if (index === 0 && this._lastIndex === (len - 1)) {
        // wrap-around
        translateRight = true;
        if (this.carousel) {
          translateRight = false;
          virtualIndex = len;
        }
      } else if (index === (len - 1) && this._lastIndex === 0) {
        // wrap-around
        translateRight = false;
        if (this.carousel) {
          translateRight = true;
          virtualLastIndex = len;
        }
      } else if (index > this._lastIndex) {
        translateRight = false;
      } else {
        translateRight = true;
      }

      if (translateRight) {
        var item;

        // we translate to the right
        for (var i = virtualLastIndex; i >= virtualIndex; i--) {
          item = this.items[i % len];
          this._initPage(
              item,
              this._computeTransition(virtualLastIndex - virtualIndex),
              this._getOffsetWidth() * (i - skipped - virtualLastIndex));

          // Need for dom.flush()?
          if (item.offsetWidth === 0) {
            this._resetPage(item);
            skipped--;
          }
        }
      } else {
        skipped = 0;

        // we translate to the left
        for (var j = virtualLastIndex; j <= virtualIndex; j++) {
          item = this.items[j % len];
          this._initPage(
              item,
              this._computeTransition(virtualIndex - virtualLastIndex),
              this._getOffsetWidth() * (j - skipped - virtualLastIndex));

          // Need for dom.flush()?
          if (item.offsetWidth === 0) {
            this._resetPage(item);
            skipped++;
          }
        }
      }
      this._transitionRunning = true;

      // before animating, we need to be sure style are updated correctly
      this.async(function() {
        this._animatePages((virtualLastIndex - virtualIndex + skipped) * this._getOffsetWidth());
      });
    },

    // Element page management
    _setUpSwipePages: function() {
      // reset the animated page list
      this._animatedPages = [];

      // selected page
      this._initPage(this.selectedItem, 'none', 0);

      // left candidate
      var skipped = 0;
      var found = false;
      while (!found) {
        var leftIndex = (Number(this.indexOf(this.selectedItem)) - 1 - skipped + this.items.length) % this.items.length;
        this._leftCandidate = this.items[leftIndex];
        this._initPage(this._leftCandidate, 'none', -this._getOffsetWidth());

        // Need for dom.flush()?
        if (this._leftCandidate.offsetWidth > 0) {
          found = true;
        } else {
          this._resetPage(this._leftCandidate);
          skipped++;
        }
      }

      // right candidate
      skipped = 0;
      found = false;
      while (!found) {
        var rightIndex = (Number(this.indexOf(this.selectedItem)) + 1 + skipped) % this.items.length;
        this._rightCandidate = this.items[rightIndex];
        this._initPage(this._rightCandidate, 'none', this._getOffsetWidth());

        // Need for dom.flush()?
        if (this._rightCandidate.offsetWidth > 0) {
          found = true;
        } else {
          this._resetPage(this._rightCandidate);
          skipped++;
        }
      }
    },

    // prepare the page for animation and add it to the list of pages to be animated
    _initPage: function(page, transition, left) {
      if (!page) {
        return;
      }
      page.style.left = left + 'px';
      page.style.webkitTransition = transition;
      page.style.transition = transition;
      this.toggleClass('iron-swiping', true, page);

      this._animatedPages.push(page);
    },

    _animatePages: function(x) {
      for (var i = 0; i < this._animatedPages.length; i++) {
        this.translate3d(x + 'px', '0px', '0px', this._animatedPages[i]);
      }
    },

    // this function is useful if only 2 pages are available and we need to switch the next/previous page
    // on the left/right side depending on the direction of the swipe given with `dx`
    _switchPageIfNecessary: function(dx) {
      if (this._leftCandidate && this._rightCandidate && this._leftCandidate === this._rightCandidate) {
        var direction = dx > 0 ? -1 : 1;
        this._rightCandidate.style.left = (direction * this._getOffsetWidth()) + 'px';
      }
    },

    _selectPage: function(page) {
      var index = this.indexOf(page);

      // TODO: should be replaced with this.selectIndex when merged in master:
      // https://github.com/PolymerElements/iron-selector/issues/87
      this.selected = this._indexToValue(index);
    },

    _resetPage: function(page) {
      page.style.left = '0px';
      page.style.webkitTransition = 'none';
      page.style.transition = 'none';
      this.toggleClass('iron-swiping', false, page);

      this._animatedPages.pop();
    },

    // remove the iron-swiping class and transition
    _resetPages: function() {
      for (var i = 0; i < this._animatedPages.length; i++) {
        this._animatedPages[i].style.left = '0px';
        this._animatedPages[i].style.webkitTransition = 'none';
        this._animatedPages[i].style.transition = 'none';
        this._animatedPages[i].setAttribute('aria-hidden', !this._animatedPages[i].classList.contains('iron-selected'));
        this.toggleClass('iron-swiping', false, this._animatedPages[i]);
        this.transform('none', this._animatedPages[i]);
      }
      this._transitionRunning = false;
      this._swipeStarted = false;
      this.isGesture = false;
    },

    _onTransitionEnd: function(event) {
      // reset pages state
      this._resetPages();
    },

    // Element utility functions
    _canCycle: function(trackData) {
      var index = this._valueToIndex(this.selected);

      if (index === 0 && trackData.dx > 0) {
        return false;
      }
      if (index === this.items.length - 1 && trackData.dx < 0) {
        return false;
      }
      return true;
    },

    _getOffsetWidth: function() {
      this._offsetWidth = this._offsetWidth || this.offsetWidth + (2 * this.padding);
      return this._offsetWidth;
    },

    _onResize: function() {
      this._offsetWidth = this.offsetWidth + (2 * this.padding);
      this._setSliderWidth(this._offsetWidth);
    },

    _computeTransition: function(factor) {
      var duration = factor * this.transitionDuration;
      if (this.maximumTransitionDuration) {
        duration = Math.min(this.maximumTransitionDuration, duration);
      }
      return 'transform ' + duration + 'ms ' + this.transitionTimingFunction;
    }
  });
}());
