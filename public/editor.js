// Editor-Module, kopiert aus bpmndesk (github.com/TheRealHuzur/bpmndesk, public/index.html).
// bpmndesk selbst bleibt unverändert. Hier nur übernommen und als Modul bereitgestellt.
// Enthält: Elementvorrat der Modi Easy, Basis, Vollständig, Palette, Kontextmenü und Popup-Filter.
(function () {
  "use strict";
  const EASY_PEASY_PALETTE_ENTRIES = [
    { key: "hand-tool", group: "tools", className: "bpmn-icon-hand-tool", title: "Hand-Tool", toolAction: "hand" },
    { key: "lasso-tool", group: "tools", className: "bpmn-icon-lasso-tool", title: "Lasso-Tool", toolAction: "lasso" },
    { key: "space-tool", group: "tools", className: "bpmn-icon-space-tool", title: "Space-Tool", toolAction: "space" },
    { key: "global-connect-tool", group: "tools", className: "bpmn-icon-connection-multi", title: "Connect-Tool", toolAction: "connect" },
    { key: "tool-separator", separator: true, group: "tools" },
    { key: "create.start-event", group: "event", className: "bpmn-icon-start-event-none", title: "Start-Event", type: "bpmn:StartEvent" },
    { key: "create.end-event", group: "event", className: "bpmn-icon-end-event-none", title: "End-Event", type: "bpmn:EndEvent" },
    { key: "create.task", group: "activity", className: "bpmn-icon-task", title: "Task", type: "bpmn:Task" },
    { key: "create.exclusive-gateway", group: "gateway", className: "bpmn-icon-gateway-xor", title: "Exklusives Gateway", type: "bpmn:ExclusiveGateway" },
    { key: "create.parallel-gateway", group: "gateway", className: "bpmn-icon-gateway-parallel", title: "Paralleles Gateway", type: "bpmn:ParallelGateway" },
    { key: "create.participant-expanded", group: "collaboration", className: "bpmn-icon-participant", title: "Pool mit Lane", type: "bpmn:Participant", participantKind: "expanded" },
    { key: "create.participant-empty", group: "collaboration", className: "bpmn-icon-participant", title: "Black-Box-Pool", type: "bpmn:Participant", participantKind: "empty" }
  ];

  const BASIS_PALETTE_ENTRIES = [
    { key: "hand-tool", group: "tools", className: "bpmn-icon-hand-tool", title: "Hand-Tool", toolAction: "hand" },
    { key: "lasso-tool", group: "tools", className: "bpmn-icon-lasso-tool", title: "Lasso-Tool", toolAction: "lasso" },
    { key: "space-tool", group: "tools", className: "bpmn-icon-space-tool", title: "Space-Tool", toolAction: "space" },
    { key: "global-connect-tool", group: "tools", className: "bpmn-icon-connection-multi", title: "Connect-Tool", toolAction: "connect" },
    { key: "tool-separator", separator: true, group: "tools" },
    { key: "create.start-event", group: "event-start", className: "bpmn-icon-start-event-none", title: "Start-Event", type: "bpmn:StartEvent" },
    { key: "create.start-event-message", group: "event-start", className: "bpmn-icon-start-event-message", title: "Nachrichten-Start", type: "bpmn:StartEvent", eventDefinitionType: "bpmn:MessageEventDefinition" },
    { key: "create.start-event-timer", group: "event-start", className: "bpmn-icon-start-event-timer", title: "Zeit-Start", type: "bpmn:StartEvent", eventDefinitionType: "bpmn:TimerEventDefinition" },
    { key: "create.start-event-condition", group: "event-start", className: "bpmn-icon-start-event-condition", title: "Bedingter Start", type: "bpmn:StartEvent", eventDefinitionType: "bpmn:ConditionalEventDefinition" },
    { key: "create.intermediate-event", group: "event-intermediate", className: "bpmn-icon-intermediate-event-none", title: "Zwischenereignis", type: "bpmn:IntermediateCatchEvent" },
    { key: "create.intermediate-event-message", group: "event-intermediate", className: "bpmn-icon-intermediate-event-catch-message", title: "Nachrichten-Zwischenereignis", type: "bpmn:IntermediateCatchEvent", eventDefinitionType: "bpmn:MessageEventDefinition" },
    { key: "create.intermediate-event-timer", group: "event-intermediate", className: "bpmn-icon-intermediate-event-catch-timer", title: "Zeit-Zwischenereignis", type: "bpmn:IntermediateCatchEvent", eventDefinitionType: "bpmn:TimerEventDefinition" },
    { key: "create.intermediate-event-condition", group: "event-intermediate", className: "bpmn-icon-intermediate-event-catch-condition", title: "Bedingtes Zwischenereignis", type: "bpmn:IntermediateCatchEvent", eventDefinitionType: "bpmn:ConditionalEventDefinition" },
    { key: "create.end-event", group: "event-end", className: "bpmn-icon-end-event-none", title: "End-Event", type: "bpmn:EndEvent" },
    { key: "create.end-event-message", group: "event-end", className: "bpmn-icon-end-event-message", title: "Nachrichten-Ende", type: "bpmn:EndEvent", eventDefinitionType: "bpmn:MessageEventDefinition" },
    { key: "create.task", group: "activity", className: "bpmn-icon-task", title: "Task", type: "bpmn:Task" },
    { key: "create.subprocess-collapsed", group: "activity", className: "bpmn-icon-subprocess-collapsed", title: "Teilprozess", type: "bpmn:SubProcess", shapeOptions: { isExpanded: false } },
    { key: "create.exclusive-gateway", group: "gateway", className: "bpmn-icon-gateway-xor", title: "Exklusives Gateway", type: "bpmn:ExclusiveGateway" },
    { key: "create.parallel-gateway", group: "gateway", className: "bpmn-icon-gateway-parallel", title: "Paralleles Gateway", type: "bpmn:ParallelGateway" },
    { key: "create.event-based-gateway", group: "gateway", className: "bpmn-icon-gateway-eventbased", title: "Ereignisbasiertes Gateway", type: "bpmn:EventBasedGateway" },
    { key: "create.data-object", group: "data", className: "bpmn-icon-data-object", title: "Datenobjekt", type: "bpmn:DataObjectReference" },
    { key: "create.data-store", group: "data", className: "bpmn-icon-data-store", title: "Datenspeicher", type: "bpmn:DataStoreReference" },
    { key: "create.participant-expanded", group: "collaboration", className: "bpmn-icon-participant", title: "Pool mit Lane", type: "bpmn:Participant", participantKind: "expanded" },
    { key: "create.participant-empty", group: "collaboration", className: "bpmn-icon-participant", title: "Black-Box-Pool", type: "bpmn:Participant", participantKind: "empty" }
  ];

  const MODE_RULES = {
    easy: {
      paletteEntries: EASY_PEASY_PALETTE_ENTRIES,
      appendDescriptors: [
        { key: "append.task", type: "bpmn:Task", className: "bpmn-icon-task", title: "Task anhängen" },
        { key: "append.end-event", type: "bpmn:EndEvent", className: "bpmn-icon-end-event-none", title: "End-Event anhängen" },
        { key: "append.exclusive-gateway", type: "bpmn:ExclusiveGateway", className: "bpmn-icon-gateway-xor", title: "Exklusives Gateway anhängen" },
        { key: "append.parallel-gateway", type: "bpmn:ParallelGateway", className: "bpmn-icon-gateway-parallel", title: "Paralleles Gateway anhängen" }
      ]
    },
    basis: {
      paletteEntries: BASIS_PALETTE_ENTRIES,
      appendDescriptors: [
        { key: "append.task", type: "bpmn:Task", className: "bpmn-icon-task", title: "Task anhängen" },
        { key: "append.subprocess", type: "bpmn:SubProcess", className: "bpmn-icon-subprocess-collapsed", title: "Teilprozess anhängen", shapeOptions: { isExpanded: false } },
        { key: "append.end-event", type: "bpmn:EndEvent", className: "bpmn-icon-end-event-none", title: "End-Event anhängen" },
        { key: "append.message-end-event", type: "bpmn:EndEvent", className: "bpmn-icon-end-event-message", title: "Nachrichten-Ende anhängen", eventDefinitionType: "bpmn:MessageEventDefinition" },
        { key: "append.exclusive-gateway", type: "bpmn:ExclusiveGateway", className: "bpmn-icon-gateway-xor", title: "Exklusives Gateway anhängen" },
        { key: "append.parallel-gateway", type: "bpmn:ParallelGateway", className: "bpmn-icon-gateway-parallel", title: "Paralleles Gateway anhängen" },
        { key: "append.event-based-gateway", type: "bpmn:EventBasedGateway", className: "bpmn-icon-gateway-eventbased", title: "Ereignisbasiertes Gateway anhängen" },
        { key: "append.intermediate-event", type: "bpmn:IntermediateCatchEvent", className: "bpmn-icon-intermediate-event-none", title: "Zwischenereignis anhängen" },
        { key: "append.intermediate-message", type: "bpmn:IntermediateCatchEvent", className: "bpmn-icon-intermediate-event-catch-message", title: "Nachrichten-Zwischenereignis anhängen", eventDefinitionType: "bpmn:MessageEventDefinition" },
        { key: "append.intermediate-timer", type: "bpmn:IntermediateCatchEvent", className: "bpmn-icon-intermediate-event-catch-timer", title: "Zeit-Zwischenereignis anhängen", eventDefinitionType: "bpmn:TimerEventDefinition" },
        { key: "append.intermediate-condition", type: "bpmn:IntermediateCatchEvent", className: "bpmn-icon-intermediate-event-catch-condition", title: "Bedingtes Zwischenereignis anhängen", eventDefinitionType: "bpmn:ConditionalEventDefinition" }
      ]
    },
    vollstaendig: {
      paletteEntries: [],
      appendDescriptors: []
    }
  };

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function createEventBusinessObject(bpmnFactory, type, eventDefinitionType) {
    if (!eventDefinitionType) {
      return null;
    }

    return bpmnFactory.create(type, {
      eventDefinitions: [bpmnFactory.create(eventDefinitionType)]
    });
  }

  function createShapeFactory(elementFactory, bpmnFactory, descriptor) {
    return () => {
      if (descriptor.participantKind === "expanded") {
        return elementFactory.createParticipantShape({ type: "bpmn:Participant" });
      }

      if (descriptor.participantKind === "empty") {
        return elementFactory.createShape({ type: "bpmn:Participant" });
      }

      const businessObject = createEventBusinessObject(bpmnFactory, descriptor.type, descriptor.eventDefinitionType);
      return elementFactory.createShape({
        type: descriptor.type,
        ...(businessObject ? { businessObject } : {}),
        ...(descriptor.shapeOptions || {})
      });
    };
  }

  function isConnection(element) {
    return !!(element && Array.isArray(element.waypoints));
  }

  function isLabel(element) {
    return !!(element && (element.labelTarget || (element.type && /label/i.test(element.type))));
  }

  function canAppendFrom(element) {
    if (!element || isConnection(element) || isLabel(element)) {
      return false;
    }

    const type = element.businessObject && element.businessObject.$type;
    return /^bpmn:(StartEvent|Task|SubProcess|ExclusiveGateway|ParallelGateway|EventBasedGateway|IntermediateCatchEvent|IntermediateThrowEvent|EndEvent)$/.test(type || "");
  }

  function isLaneHostElement(element) {
    const type = element && element.businessObject && element.businessObject.$type;
    return type === "bpmn:Lane" || type === "bpmn:Participant";
  }

  function getParticipantLaneTarget(element) {
    if (!element || !element.businessObject) {
      return null;
    }

    if (element.businessObject.$type === "bpmn:Lane") {
      return element;
    }

    if (element.businessObject.$type !== "bpmn:Participant") {
      return null;
    }

    const childLane = Array.isArray(element.children)
      ? element.children.find((child) => child && child.businessObject && child.businessObject.$type === "bpmn:Lane")
      : null;

    return childLane || element;
  }

  function getWhitelistKey(descriptor) {
    if (descriptor.participantKind) {
      return "bpmn:Participant";
    }

    if (descriptor.type === "bpmn:SubProcess" && descriptor.shapeOptions && descriptor.shapeOptions.isExpanded === false) {
      return "bpmn:SubProcess|collapsed";
    }

    if (!descriptor.type) {
      return null;
    }

    return popupDescriptorKey(descriptor.type, descriptor.eventDefinitionType || "none");
  }

  function createPopupAllowedSet(mode) {
    return new Set(
      MODE_RULES[mode].paletteEntries
        .map(getWhitelistKey)
        .filter(Boolean)
        .concat(["bpmn:SequenceFlow", "bpmn:MessageFlow"])
    );
  }

  function popupDescriptorKey(type, variant) {
    return variant ? `${type}|${variant}` : type;
  }

  function inferPopupDescriptor(entryId, entry) {
    const haystack = `${normalizeText(entryId)} ${normalizeText(entry.className || "")} ${normalizeText(entry.label || entry.title || "")}`;

    if (/(group|annotation|text-annotation|complex-gateway|inclusive-gateway|gateway-or|compensation|signal|error|escalation|cancel|multiple|parallel-multiple|terminate|link|receive-task|user-task|service-task|manual-task|script-task|business-rule|call-activity|send-task)/.test(haystack)) {
      return "__blocked__";
    }

    if (/subprocess-expanded/.test(haystack)) {
      return "__blocked__";
    }

    if (/subprocess-collapsed/.test(haystack)) {
      return "bpmn:SubProcess|collapsed";
    }

    if (/data-object/.test(haystack)) {
      return "bpmn:DataObjectReference";
    }

    if (/data-store/.test(haystack)) {
      return "bpmn:DataStoreReference";
    }

    if (/participant|pool/.test(haystack)) {
      return "bpmn:Participant";
    }

    if (/message-flow/.test(haystack)) {
      return "bpmn:MessageFlow";
    }

    if (/sequence-flow/.test(haystack)) {
      return "bpmn:SequenceFlow";
    }

    if (/gateway-eventbased/.test(haystack)) {
      return "bpmn:EventBasedGateway";
    }

    if (/gateway-parallel/.test(haystack)) {
      return "bpmn:ParallelGateway";
    }

    if (/gateway-xor|exclusive-gateway/.test(haystack)) {
      return "bpmn:ExclusiveGateway";
    }

    if (/start-event-message/.test(haystack)) {
      return popupDescriptorKey("bpmn:StartEvent", "bpmn:MessageEventDefinition");
    }

    if (/start-event-timer/.test(haystack)) {
      return popupDescriptorKey("bpmn:StartEvent", "bpmn:TimerEventDefinition");
    }

    if (/start-event-condition/.test(haystack)) {
      return popupDescriptorKey("bpmn:StartEvent", "bpmn:ConditionalEventDefinition");
    }

    if (/start-event-none|create\.start/.test(haystack)) {
      return popupDescriptorKey("bpmn:StartEvent", "none");
    }

    if (/intermediate-event-catch-message|intermediate-event-throw-message|message-intermediate-event/.test(haystack)) {
      return popupDescriptorKey("bpmn:IntermediateCatchEvent", "bpmn:MessageEventDefinition");
    }

    if (/intermediate-event-catch-timer|timer-intermediate-event/.test(haystack)) {
      return popupDescriptorKey("bpmn:IntermediateCatchEvent", "bpmn:TimerEventDefinition");
    }

    if (/intermediate-event-catch-condition|condition-intermediate-event/.test(haystack)) {
      return popupDescriptorKey("bpmn:IntermediateCatchEvent", "bpmn:ConditionalEventDefinition");
    }

    if (/intermediate-event-none|create\.intermediate/.test(haystack)) {
      return popupDescriptorKey("bpmn:IntermediateCatchEvent", "none");
    }

    if (/end-event-message/.test(haystack)) {
      return popupDescriptorKey("bpmn:EndEvent", "bpmn:MessageEventDefinition");
    }

    if (/end-event-none|create\.end|append\.end-event/.test(haystack)) {
      return popupDescriptorKey("bpmn:EndEvent", "none");
    }

    if (/subprocess/.test(haystack)) {
      return "bpmn:SubProcess|collapsed";
    }

    if (/task/.test(haystack)) {
      return "bpmn:Task";
    }

    return null;
  }

  function observePopupDom(canvas, mode) {
    const container = canvas && canvas.getContainer ? canvas.getContainer() : document.body;
    const allowedSet = createPopupAllowedSet(mode);

    const filterDom = () => {
      container.querySelectorAll(".djs-popup .entry, .djs-popup-menu .entry, .djs-popup .djs-popup-entry").forEach((node, index) => {
        const descriptor = inferPopupDescriptor(node.getAttribute("data-action") || node.getAttribute("data-id") || `popup-${index}`, {
          className: `${node.className} ${node.querySelector("[class*='bpmn-icon-']")?.className || ""}`,
          label: node.textContent || "",
          title: node.getAttribute("title") || node.getAttribute("aria-label") || ""
        });
        const isAllowed = descriptor === null ? true : descriptor !== "__blocked__" && allowedSet.has(descriptor);
        node.style.display = isAllowed ? "" : "none";
      });
    };

    const observer = new MutationObserver(filterDom);
    observer.observe(container, { childList: true, subtree: true });
    filterDom();
  }

  function createPaletteProviderModule(mode) {
    const paletteEntries = MODE_RULES[mode].paletteEntries;

    function BpmndeskPaletteProvider(palette, create, elementFactory, bpmnFactory, handTool, lassoTool, spaceTool, globalConnect) {
      this._create = create;
      this._elementFactory = elementFactory;
      this._bpmnFactory = bpmnFactory;
      this._handTool = handTool;
      this._lassoTool = lassoTool;
      this._spaceTool = spaceTool;
      this._globalConnect = globalConnect;
      palette.registerProvider(this);
    }

    BpmndeskPaletteProvider.$inject = ["palette", "create", "elementFactory", "bpmnFactory", "handTool", "lassoTool", "spaceTool", "globalConnect"];

    BpmndeskPaletteProvider.prototype.getPaletteEntries = function getPaletteEntries() {
      const actions = {
        hand: (event) => this._handTool.activateHand(event),
        lasso: (event) => this._lassoTool.activateSelection(event),
        space: (event) => this._spaceTool.activateSelection(event),
        connect: (event) => this._globalConnect.start(event)
      };

      return Object.fromEntries(paletteEntries.map((descriptor) => {
        if (descriptor.separator) {
          return [descriptor.key, { group: descriptor.group, separator: true }];
        }

        if (descriptor.toolAction) {
          return [descriptor.key, { group: descriptor.group, className: descriptor.className, title: descriptor.title, action: { click: actions[descriptor.toolAction] } }];
        }

        const createShape = createShapeFactory(this._elementFactory, this._bpmnFactory, descriptor);
        const startCreate = (event) => this._create.start(event, createShape());
        return [descriptor.key, { group: descriptor.group, className: descriptor.className, title: descriptor.title, action: { dragstart: startCreate, click: startCreate } }];
      }));
    };

    return { __init__: ["paletteProvider"], paletteProvider: ["type", BpmndeskPaletteProvider] };
  }

  function createContextPadProviderModule(mode) {
    function BpmndeskContextPadProvider(contextPad, create, elementFactory, bpmnFactory, connect, modeling, injector) {
      this._create = create;
      this._elementFactory = elementFactory;
      this._bpmnFactory = bpmnFactory;
      this._connect = connect;
      this._modeling = modeling;
      this._autoPlace = injector.get("autoPlace", false);
      this._mode = mode;
      contextPad.registerProvider(this);
    }

    BpmndeskContextPadProvider.$inject = ["contextPad", "create", "elementFactory", "bpmnFactory", "connect", "modeling", "injector"];

    BpmndeskContextPadProvider.prototype.getContextPadEntries = function getContextPadEntries(element) {
      const entries = {
        delete: {
          group: "edit",
          className: "bpmn-icon-trash",
          title: "Löschen",
          action: { click: () => this._modeling.removeElements([element]) }
        }
      };

      if (!isConnection(element) && !isLabel(element)) {
        entries.connect = {
          group: "connect",
          className: "bpmn-icon-connection-multi",
          title: "Verbindung ziehen",
          action: {
            click: (event) => this._connect.start(event, element),
            dragstart: (event) => this._connect.start(event, element)
          }
        };
      }

      if (isLaneHostElement(element)) {
        const getLaneTarget = () => getParticipantLaneTarget(element);
        const addLane = (location) => () => {
          const target = getLaneTarget();

          if (target && typeof this._modeling.addLane === "function") {
            this._modeling.addLane(target, location);
          }
        };
        const splitLane = () => {
          const target = getLaneTarget();

          if (target && typeof this._modeling.splitLane === "function") {
            this._modeling.splitLane(target, 2);
          }
        };

        entries["lane-insert-above"] = {
          group: "lane-insert-above",
          className: "bpmn-icon-lane-insert-above",
          title: "Lane oberhalb einfügen",
          action: { click: addLane("top") }
        };

        entries["lane-divide-two"] = {
          group: "lane-divide",
          className: "bpmn-icon-lane-divide-two",
          title: "In zwei Lanes teilen",
          action: { click: splitLane }
        };

        entries["lane-insert-below"] = {
          group: "lane-insert-below",
          className: "bpmn-icon-lane-insert-below",
          title: "Lane unterhalb einfügen",
          action: { click: addLane("bottom") }
        };
      }

      if (!canAppendFrom(element)) {
        return entries;
      }

      MODE_RULES[this._mode].appendDescriptors.forEach((descriptor) => {
        const createShape = createShapeFactory(this._elementFactory, this._bpmnFactory, descriptor);
        const appendShape = (event) => {
          const shape = createShape();
          if (this._autoPlace) {
            this._autoPlace.append(element, shape);
            return;
          }
          this._create.start(event, shape, { source: element });
        };

        entries[descriptor.key] = {
          group: "append",
          className: descriptor.className,
          title: descriptor.title,
          action: { click: appendShape, dragstart: appendShape }
        };
      });

      return entries;
    };

    BpmndeskContextPadProvider.prototype.getMultiElementContextPadEntries = function getMultiElementContextPadEntries() {
      return {};
    };

    return { __init__: ["contextPadProvider"], contextPadProvider: ["type", BpmndeskContextPadProvider] };
  }

  function createPopupFilterModule(mode) {
    function BpmndeskPopupFilter(canvas) {
      observePopupDom(canvas, mode);
    }

    BpmndeskPopupFilter.$inject = ["canvas"];

    return { __init__: ["bpmndeskPopupFilter"], bpmndeskPopupFilter: ["type", BpmndeskPopupFilter] };
  }

  const easyPeasyModules = [createPaletteProviderModule("easy"), createContextPadProviderModule("easy"), createPopupFilterModule("easy")];
  const basisModules = [createPaletteProviderModule("basis"), createContextPadProviderModule("basis"), createPopupFilterModule("basis")];
  const vollstaendigModules = [];

  function getModulesForMode(mode) {
    if (mode === "easy") {
      return easyPeasyModules;
    }

    if (mode === "vollstaendig") {
      return vollstaendigModules;
    }

    return basisModules;
  }

  function createModeler(container, mode) {
    return new BpmnJS({
      container,
      additionalModules: getModulesForMode(mode),
      // ProzessPilot: weitere Angaben am Schritt (public/wissen.js)
      moddleExtensions: window.PPWissen ? { pp: window.PPWissen.descriptor } : {}
    });
  }

  window.PPEditor = {
    createModeler,
    MODES: ["easy", "basis", "vollstaendig"],
    MODE_LABELS: { easy: "Easy Peasy", basis: "Basis-Level", vollstaendig: "Vollständig" }
  };
})();
