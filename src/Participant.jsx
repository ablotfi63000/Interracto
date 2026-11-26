      <div className="reaction-bar">
        {REACTIONS.map((e) => (
          <button key={e} className="reaction" onClick={() => react(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
